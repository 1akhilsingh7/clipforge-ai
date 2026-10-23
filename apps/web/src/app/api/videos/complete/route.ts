import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "videos";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const videoId = typeof body.videoId === "string" ? body.videoId : null;
  if (!videoId) {
    return NextResponse.json({ error: "videoId is required." }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  const video = await prisma.video.findFirst({
    where: { id: videoId, project: { ownerId: dbUser?.id } },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  await prisma.video.update({
    where: { id: video.id },
    data: { status: "PROCESSING" },
  });

  // FastAPI has no Supabase credentials by design (smaller blast radius
  // if that service is ever compromised) — so we hand it a short-lived
  // signed URL rather than a bucket path it can't resolve on its own.
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(video.storagePath, 60 * 10); // 10 minutes — plenty for ffprobe

  if (signError || !signed) {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED", failureReason: "Could not create download URL." },
    });
    return NextResponse.json({ error: "Could not create download URL." }, { status: 500 });
  }

  try {
    const apiRes = await fetch(`${process.env.API_BASE_URL}/videos/${video.id}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
      },
      body: JSON.stringify({ sourceUrl: signed.signedUrl }),
    });

    if (!apiRes.ok) {
      throw new Error(`API responded ${apiRes.status}`);
    }
  } catch {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED", failureReason: "Metadata extraction failed to start." },
    });
    return NextResponse.json({ error: "Processing failed to start." }, { status: 502 });
  }

  const updated = await prisma.video.findUnique({ where: { id: video.id } });
  return NextResponse.json({ video: updated });
}
