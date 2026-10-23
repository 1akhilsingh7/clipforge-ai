import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase redirects here after:
 *  - Google OAuth sign-in
 *  - Email confirmation link click
 *  - Password reset link click
 * We exchange the one-time `code` for a real session, then make sure a
 * matching row exists in our own `users` table (Supabase only knows
 * about credentials — app data like plan/credits lives in Postgres).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectedFrom") ?? "/dashboard";

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Fire-and-forget style, but awaited: cheap upsert, and the
      // dashboard immediately after this redirect depends on the row
      // existing, so we don't want a race.
      await fetch(`${origin}/api/users/sync`, {
        method: "POST",
        headers: {
          Cookie: request.headers.get("cookie") ?? "",
        },
      });

      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Code missing or exchange failed — send back to login with an error
  // flag rather than silently landing on a broken dashboard.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
