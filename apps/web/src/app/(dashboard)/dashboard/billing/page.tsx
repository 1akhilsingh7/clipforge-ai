import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UpgradeButton, ManageBillingButton } from "@/components/dashboard/BillingButtons";

const planDetails = {
  FREE: { label: "Free", features: ["Limited exports", "Watermark", "Daily usage limit"] },
  PRO: { label: "Pro", features: ["Unlimited exports", "AI images", "AI videos", "Premium templates"] },
  BUSINESS: { label: "Business", features: ["Team collaboration", "API access", "Priority processing"] },
} as const;

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const dbUser = await prisma.user.findUnique({
    where: { supabaseAuthId: authUser.id },
  });

  const plan = planDetails[dbUser?.plan ?? "FREE"];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Billing</h1>

      <div className="max-w-md rounded-xl border border-border p-6">
        <p className="text-xs text-foreground/50">Current plan</p>
        <p className="mt-1 text-xl font-semibold">{plan.label}</p>
        <ul className="mt-4 flex flex-col gap-1 text-sm text-foreground/70">
          {plan.features.map((feature) => (
            <li key={feature}>• {feature}</li>
          ))}
        </ul>

        {dbUser?.plan === "FREE" && (
          <div className="flex gap-3">
            <UpgradeButton plan="PRO" />
            <UpgradeButton plan="BUSINESS" />
          </div>
        )}
        {dbUser?.stripeCustomerId && <ManageBillingButton />}
      </div>
    </div>
  );
}
