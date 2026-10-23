import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
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
    include: {
      transcript: true,
      clips: { orderBy: { totalScore: "desc" } },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  return NextResponse.json({
    transcriptStatus: video.transcript?.status ?? "PENDING",
    transcriptFailureReason: video.transcript?.failureReason ?? null,
    clips: video.clips,
  });
}
