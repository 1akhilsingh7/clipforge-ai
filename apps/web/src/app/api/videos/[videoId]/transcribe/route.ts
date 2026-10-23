import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "videos";

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

  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  if (video.status !== "READY") {
    return NextResponse.json(
      { error: "Video must finish processing before transcription can start." },
      { status: 409 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(video.storagePath, 60 * 30); // transcription can take longer than metadata reads

  if (signError || !signed) {
    return NextResponse.json({ error: "Could not create download URL." }, { status: 500 });
  }

  // Fire the request but don't block the HTTP response on it — a real
  // long video can take minutes to transcribe on CPU. The frontend
  // polls the transcript's status instead of waiting on this request.
  fetch(`${process.env.API_BASE_URL}/videos/${video.id}/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
    body: JSON.stringify({ sourceUrl: signed.signedUrl }),
  }).catch(() => {
    // If the fetch itself fails to even dispatch (e.g. API is down),
    // there's nothing meaningful to return to a caller who already got
    // a 202 — this would be a good place to hook up error alerting in
    // the Admin/Analytics phase.
  });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
