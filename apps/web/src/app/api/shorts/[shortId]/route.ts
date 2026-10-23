import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SHORTS_BUCKET = "shorts";

export async function GET(
  _request: Request,
  { params }: { params: { shortId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });

  const short = await prisma.short.findFirst({
    where: { id: params.shortId, clip: { video: { project: { ownerId: dbUser?.id } } } },
  });

  if (!short) {
    return NextResponse.json({ error: "Short not found." }, { status: 404 });
  }

  let downloadUrl: string | null = null;
  if (short.status === "READY" && short.storagePath) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.storage
      .from(SHORTS_BUCKET)
      .createSignedUrl(short.storagePath, 60 * 60); // 1 hour, enough for a preview/download session
    downloadUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    status: short.status,
    failureReason: short.failureReason,
    downloadUrl,
  });
}
