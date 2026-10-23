import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkAiRateLimit } from "@/lib/rate-limit";

const IMAGES_BUCKET = "generated-images";
const IMAGE_GENERATION_CREDIT_COST = 5;

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimit = await checkAiRateLimit(authUser.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rateLimit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User record missing" }, { status: 409 });
  }

  if (dbUser.credits < IMAGE_GENERATION_CREDIT_COST) {
    return NextResponse.json(
      { error: "Not enough credits. Upgrade your plan or wait for your next credit refresh." },
      { status: 402 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const stylePreset = typeof body.stylePreset === "string" ? body.stylePreset : null;
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "1:1";

  if (prompt.length === 0 || prompt.length > 1000) {
    return NextResponse.json({ error: "Prompt must be 1–1000 characters." }, { status: 400 });
  }

  // Deduct credits up front, atomically, so two concurrent requests
  // can't both pass the check above and double-spend the same credits.
  const updated = await prisma.user.updateMany({
    where: { id: dbUser.id, credits: { gte: IMAGE_GENERATION_CREDIT_COST } },
    data: { credits: { decrement: IMAGE_GENERATION_CREDIT_COST } },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Not enough credits." }, { status: 402 });
  }

  const image = await prisma.generatedImage.create({
    data: { userId: dbUser.id, prompt, stylePreset, aspectRatio, status: "PROCESSING" },
  });

  const storagePath = `${dbUser.id}/${image.id}.png`;
  const admin = createSupabaseAdminClient();
  const { data: uploadSigned } = await admin.storage
    .from(IMAGES_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (!uploadSigned) {
    await prisma.generatedImage.update({
      where: { id: image.id },
      data: { status: "FAILED", failureReason: "Could not prepare storage." },
    });
    // Refund the credits — the job never actually ran.
    await prisma.user.update({ where: { id: dbUser.id }, data: { credits: { increment: IMAGE_GENERATION_CREDIT_COST } } });
    return NextResponse.json({ error: "Could not prepare storage." }, { status: 500 });
  }

  fetch(`${process.env.API_BASE_URL}/generation/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
    body: JSON.stringify({
      imageId: image.id,
      prompt,
      stylePreset,
      aspectRatio,
      uploadSignedUrl: uploadSigned.signedUrl,
      storagePath,
    }),
  }).catch(() => {});

  return NextResponse.json({ imageId: image.id }, { status: 202 });
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  const images = await prisma.generatedImage.findMany({
    where: { userId: dbUser?.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ images });
}
