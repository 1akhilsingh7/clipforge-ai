import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/dashboard/ProfileForm";

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const dbUser = await prisma.user.findUnique({
    where: { supabaseAuthId: authUser.id },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <div>
        <p className="text-sm text-foreground/50">Email</p>
        <p className="text-sm">{authUser.email}</p>
        <p className="mt-1 text-xs text-foreground/30">
          Managed by your login provider — change it from your Google
          account or via a password reset.
        </p>
      </div>

      <ProfileForm initialDisplayName={dbUser?.displayName ?? ""} />
    </div>
  );
}
