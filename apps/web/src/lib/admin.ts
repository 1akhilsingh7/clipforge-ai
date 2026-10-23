import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Returns the admin's dbUser record, or null if the current user isn't
 * authenticated or isn't an admin. Callers should redirect/404 on null
 * rather than leak whether a given page even exists to non-admins.
 */
export async function requireAdmin() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser?.isAdmin) return null;

  return dbUser;
}
