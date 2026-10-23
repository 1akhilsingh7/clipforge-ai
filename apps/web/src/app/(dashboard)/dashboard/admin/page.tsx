import { notFound } from "next/navigation";
import { prisma } from "@clipforge/db";
import { requireAdmin } from "@/lib/admin";
import { FeatureFlagToggle } from "@/components/dashboard/FeatureFlagToggle";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    // 404 rather than a "you're not authorized" page — doesn't confirm
    // to a non-admin that this route even exists.
    notFound();
  }

  const [
    totalUsers,
    usersByPlan,
    totalProjects,
    totalVideos,
    totalShorts,
    totalGeneratedImages,
    totalGeneratedVideos,
    recentErrors,
    featureFlags,
    signupsLast30Days,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["plan"], _count: true }),
    prisma.project.count(),
    prisma.video.count(),
    prisma.short.count({ where: { status: "READY" } }),
    prisma.generatedImage.count({ where: { status: "READY" } }),
    prisma.generatedVideo.count({ where: { status: "READY" } }),
    prisma.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
  ]);

  const planCounts = Object.fromEntries(usersByPlan.map((p) => [p.plan, p._count]));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total users" value={totalUsers} />
        <Stat label="New users (30d)" value={signupsLast30Days} />
        <Stat label="Pro subscribers" value={planCounts.PRO ?? 0} />
        <Stat label="Business subscribers" value={planCounts.BUSINESS ?? 0} />
        <Stat label="Projects" value={totalProjects} />
        <Stat label="Videos uploaded" value={totalVideos} />
        <Stat label="Shorts rendered" value={totalShorts} />
        <Stat label="AI images + videos" value={totalGeneratedImages + totalGeneratedVideos} />
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-2 text-xs text-foreground/50">
          Revenue and live server/AI-usage metrics require a real deployment
          — this sandbox has no Stripe/monitoring connection to pull them
          from. Subscriber counts above are real; wire in Stripe's
          reporting API and your hosting provider's metrics (Railway/
          Vercel dashboards or an APM like Sentry) for the rest.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground/70">Feature flags</h2>
        <div className="flex flex-col gap-2">
          {featureFlags.length === 0 && (
            <p className="text-sm text-foreground/40">
              No feature flags yet — create one via a direct DB insert or
              extend this page with a create form.
            </p>
          )}
          {featureFlags.map((flag) => (
            <FeatureFlagToggle key={flag.key} flagKey={flag.key} enabled={flag.enabled} description={flag.description} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground/70">Recent errors</h2>
        {recentErrors.length === 0 ? (
          <p className="text-sm text-foreground/40">No errors logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentErrors.map((err) => (
              <li key={err.id} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex justify-between text-foreground/40">
                  <span>{err.path ?? "unknown path"}</span>
                  <span>{err.createdAt.toISOString()}</span>
                </div>
                <p className="mt-1 text-red-400">{err.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
