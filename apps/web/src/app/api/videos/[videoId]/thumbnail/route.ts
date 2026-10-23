import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SOURCE_BUCKET = "videos";
const THUMBNAILS_BUCKET = "thumbnails";

export async function POST(
  request: Request,
  { params }: { params: { videoId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, project: { ownerId: dbUser?.id } },
  });

  if (!video || !dbUser) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const timestampSeconds = typeof body.timestampSeconds === "number" ? body.timestampSeconds : 0;
  const overlayText = typeof body.overlayText === "string" ? body.overlayText.slice(0, 100) : null;
  const style = typeof body.style === "string" ? body.style : "BOLD_TEXT";

  const thumbnail = await prisma.thumbnail.create({
    data: {
      videoId: video.id,
      status: "PROCESSING",
      style: style as never,
      overlayText,
      sourceTimestampSeconds: timestampSeconds,
    },
  });

  const admin = createSupabaseAdminClient();
  const { data: sourceSigned } = await admin.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(video.storagePath, 60 * 10);

  const storagePath = `${dbUser.id}/${video.id}/${thumbnail.id}.jpg`;
  const { data: uploadSigned } = await admin.storage
    .from(THUMBNAILS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (!sourceSigned || !uploadSigned) {
    await prisma.thumbnail.update({
      where: { id: thumbnail.id },
      data: { status: "FAILED", failureReason: "Could not prepare storage URLs." },
    });
    return NextResponse.json({ error: "Could not prepare storage." }, { status: 500 });
  }

  fetch(`${process.env.API_BASE_URL}/thumbnails/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
    body: JSON.stringify({
      thumbnailId: thumbnail.id,
      sourceDownloadUrl: sourceSigned.signedUrl,
      uploadSignedUrl: uploadSigned.signedUrl,
      storagePath,
      timestampSeconds,
      overlayText,
      style,
    }),
  }).catch(() => {});

  return NextResponse.json({ thumbnailId: thumbnail.id }, { status: 202 });
}
