import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Ensures a Postgres `users` row exists for the currently authenticated
 * Supabase user. Called right after login/signup/OAuth callback.
 * Idempotent — safe to call on every login, not just the first one,
 * so we also pick up email changes made through Supabase.
 */
export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.upsert({
    where: { supabaseAuthId: user.id },
    update: { email: user.email },
    create: {
      supabaseAuthId: user.id,
      email: user.email,
      displayName: user.user_metadata?.full_name ?? null,
    },
  });

  return NextResponse.json({ user: dbUser });
}
