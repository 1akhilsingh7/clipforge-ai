import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const THUMBNAILS_BUCKET = "thumbnails";

export async function GET(
  _request: Request,
  { params }: { params: { thumbnailId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  const thumbnail = await prisma.thumbnail.findFirst({
    where: { id: params.thumbnailId, video: { project: { ownerId: dbUser?.id } } },
  });

  if (!thumbnail) {
    return NextResponse.json({ error: "Thumbnail not found." }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  if (thumbnail.status === "READY" && thumbnail.storagePath) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage
      .from(THUMBNAILS_BUCKET)
      .createSignedUrl(thumbnail.storagePath, 60 * 60);
    downloadUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    status: thumbnail.status,
    failureReason: thumbnail.failureReason,
    downloadUrl,
  });
}
