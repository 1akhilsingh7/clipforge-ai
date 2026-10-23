import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const VIDEOS_BUCKET = "generated-videos";

export async function GET(
  _request: Request,
  { params }: { params: { videoGenId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  const video = await prisma.generatedVideo.findFirst({
    where: { id: params.videoGenId, userId: dbUser?.id },
  });

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  if (video.status === "READY" && video.storagePath) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage.from(VIDEOS_BUCKET).createSignedUrl(video.storagePath, 3600);
    downloadUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({ status: video.status, failureReason: video.failureReason, downloadUrl });
}
