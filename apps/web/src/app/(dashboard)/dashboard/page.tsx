import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/dashboard/StatCard";
import { NewProjectForm } from "@/components/dashboard/NewProjectForm";
import Link from "next/link";

function formatBytes(bytes: bigint): string {
  const num = Number(bytes);
  if (num === 0) return "0 MB";
  const mb = num / (1024 * 1024);
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

export default async function DashboardOverviewPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { supabaseAuthId: authUser.id },
    include: { _count: { select: { projects: true } } },
  });

  if (!dbUser) {
    return (
      <p className="text-sm text-red-400">
        Your account isn&apos;t fully set up yet. Try logging out and back in.
      </p>
    );
  }

  const projects = await prisma.project.findMany({
    where: { ownerId: dbUser.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { videos: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Projects" value={dbUser._count.projects} />
        <StatCard label="Credits" value={dbUser.credits} />
        <StatCard label="Plan" value={dbUser.plan} />
        <StatCard label="Storage used" value={formatBytes(dbUser.storageUsedBytes)} />
        <StatCard label="Generated shorts" lockedUntilPhase="Phase 5 (Automatic Shorts)" />
        <StatCard label="AI images" lockedUntilPhase="Phase 6 (AI Image Generator)" />
        <StatCard label="AI videos" lockedUntilPhase="Phase 6 (AI Video Generator)" />
      </div>

      <div className="rounded-xl border border-border p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground/70">Projects</h2>
        </div>

        <NewProjectForm />

        {projects.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/40">
            No projects yet — create one above, then upload a video into it.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm transition hover:bg-muted"
                >
                  <span>{project.name}</span>
                  <span className="text-foreground/40">
                    {project._count.videos} video{project._count.videos === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
