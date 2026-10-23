import { notFound } from "next/navigation";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VideoUploader } from "@/components/dashboard/VideoUploader";
import { VideoList } from "@/components/dashboard/VideoList";

export default async function ProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });

  // Scoping by ownerId here (not just projectId) is what stops one
  // user from viewing another user's project by guessing/changing the
  // URL — this is the actual access control, not the UI hiding a link.
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, ownerId: dbUser?.id },
    include: { videos: { orderBy: { createdAt: "desc" } } },
  });

  if (!project) {
    notFound();
  }

  const videos = project.videos.map((v) => ({
    id: v.id,
    originalFilename: v.originalFilename,
    status: v.status,
    durationSeconds: v.durationSeconds,
    width: v.width,
    height: v.height,
    failureReason: v.failureReason,
  }));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">{project.name}</h1>

      <VideoUploader projectId={project.id} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground/70">Videos</h2>
        <VideoList projectId={project.id} initialVideos={videos} />
      </div>
    </div>
  );
}
