import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const IMAGES_BUCKET = "generated-images";

export async function GET(
  _request: Request,
  { params }: { params: { imageId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  const image = await prisma.generatedImage.findFirst({
    where: { id: params.imageId, userId: dbUser?.id },
  });

  if (!image) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  if (image.status === "READY" && image.storagePath) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage.from(IMAGES_BUCKET).createSignedUrl(image.storagePath, 3600);
    downloadUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({ status: image.status, failureReason: image.failureReason, downloadUrl });
}
