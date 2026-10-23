import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkAiRateLimit } from "@/lib/rate-limit";

const VIDEOS_BUCKET = "generated-videos";
const VIDEO_GENERATION_CREDIT_COST = 25;

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

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const sourceImageUrl = typeof body.sourceImageUrl === "string" ? body.sourceImageUrl : null;
  const durationSeconds = [3, 5, 8].includes(body.durationSeconds) ? body.durationSeconds : 5;
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "9:16";

  if (prompt.length === 0 || prompt.length > 1000) {
    return NextResponse.json({ error: "Prompt must be 1–1000 characters." }, { status: 400 });
  }

  const updated = await prisma.user.updateMany({
    where: { id: dbUser.id, credits: { gte: VIDEO_GENERATION_CREDIT_COST } },
    data: { credits: { decrement: VIDEO_GENERATION_CREDIT_COST } },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Not enough credits." }, { status: 402 });
  }

  const video = await prisma.generatedVideo.create({
    data: {
      userId: dbUser.id,
      prompt,
      sourceImagePath: sourceImageUrl,
      durationSeconds,
      aspectRatio,
      status: "PROCESSING",
    },
  });

  const storagePath = `${dbUser.id}/${video.id}.mp4`;
  const admin = createSupabaseAdminClient();
  const { data: uploadSigned } = await admin.storage
    .from(VIDEOS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (!uploadSigned) {
    await prisma.generatedVideo.update({
      where: { id: video.id },
      data: { status: "FAILED", failureReason: "Could not prepare storage." },
    });
    await prisma.user.update({ where: { id: dbUser.id }, data: { credits: { increment: VIDEO_GENERATION_CREDIT_COST } } });
    return NextResponse.json({ error: "Could not prepare storage." }, { status: 500 });
  }

  fetch(`${process.env.API_BASE_URL}/generation/videos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
    body: JSON.stringify({
      videoId: video.id,
      prompt,
      sourceImageUrl,
      durationSeconds,
      aspectRatio,
      uploadSignedUrl: uploadSigned.signedUrl,
      storagePath,
    }),
  }).catch(() => {});

  return NextResponse.json({ videoGenId: video.id }, { status: 202 });
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
  const videos = await prisma.generatedVideo.findMany({
    where: { userId: dbUser?.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ videos });
}
