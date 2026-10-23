import { createClient } from "@supabase/supabase-js";

// SERVICE ROLE KEY — full access, bypasses RLS. Never import this into
// any client component or expose it to the browser. Only used in
// route handlers where WE decide the storage path based on the
// already-authenticated user, so bypassing RLS here is safe by
// construction, not by accident.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
