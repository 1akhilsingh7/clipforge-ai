import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isAllowedVideoFile,
  MAX_UPLOAD_BYTES_FREE,
} from "@clipforge/config/upload-limits";

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
  const { projectId, filename, mimeType, sizeBytes } = body as {
    projectId?: string;
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  };

  if (!projectId || !filename || !mimeType || typeof sizeBytes !== "number") {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Re-validate server-side. The client already checked this for UX,
  // but a client check is not a security control.
  if (!isAllowedVideoFile({ type: mimeType, name: filename })) {
    return NextResponse.json(
      { error: "Unsupported file type. Use MP4, MOV, MKV, or AVI." },
      { status: 400 }
    );
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES_FREE) {
    return NextResponse.json(
      { error: "File exceeds the 2GB upload limit for your plan." },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User record missing" }, { status: 409 });
  }

  // Ownership check — without this, any logged-in user could pass any
  // projectId and upload into someone else's project.
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: dbUser.id },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const video = await prisma.video.create({
    data: {
      projectId: project.id,
      storagePath: "", // filled in below once we know the video id
      originalFilename: filename,
      mimeType,
      sizeBytes: BigInt(sizeBytes),
      status: "UPLOADING",
    },
  });

  const extension = filename.slice(filename.lastIndexOf("."));
  const storagePath = `${dbUser.id}/${video.id}/source${extension}`;

  await prisma.video.update({
    where: { id: video.id },
    data: { storagePath },
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "FAILED", failureReason: "Could not create upload URL." },
    });
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }

  return NextResponse.json({
    videoId: video.id,
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  });
}
