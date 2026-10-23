import { redirect } from "next/navigation";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: user.id } });

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ""} isAdmin={dbUser?.isAdmin ?? false} />
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
