import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SOURCE_BUCKET = "videos";
const SHORTS_BUCKET = "shorts";

export async function POST(
  _request: Request,
  { params }: { params: { clipId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });

  // Ownership check traverses clip -> video -> project -> owner, so a
  // clip ID alone can't be used to render someone else's footage.
  const clip = await prisma.clip.findFirst({
    where: { id: params.clipId, video: { project: { ownerId: dbUser?.id } } },
    include: { video: true },
  });

  if (!clip || !dbUser) {
    return NextResponse.json({ error: "Clip not found." }, { status: 404 });
  }

  const short = await prisma.short.create({
    data: { clipId: clip.id, status: "PROCESSING" },
  });

  const admin = createSupabaseAdminClient();

  const { data: sourceSigned, error: sourceError } = await admin.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(clip.video.storagePath, 60 * 30);

  const outputPath = `${dbUser.id}/${clip.videoId}/${short.id}.mp4`;
  const { data: uploadSigned, error: uploadError } = await admin.storage
    .from(SHORTS_BUCKET)
    .createSignedUploadUrl(outputPath);

  if (sourceError || uploadError || !sourceSigned || !uploadSigned) {
    await prisma.short.update({
      where: { id: short.id },
      data: { status: "FAILED", failureReason: "Could not prepare storage URLs." },
    });
    return NextResponse.json({ error: "Could not prepare storage." }, { status: 500 });
  }

  fetch(`${process.env.API_BASE_URL}/videos/shorts/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
    body: JSON.stringify({
      shortId: short.id,
      clipId: clip.id,
      sourceDownloadUrl: sourceSigned.signedUrl,
      uploadSignedUrl: uploadSigned.signedUrl,
      storagePath: outputPath,
    }),
  }).catch(() => {
    // Same pattern as /transcribe: this is a long-running job, dispatched
    // async — the client polls /api/shorts/[shortId] for the result.
  });

  return NextResponse.json({ shortId: short.id, status: "PROCESSING" }, { status: 202 });
}
