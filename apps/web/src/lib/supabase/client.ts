import { createBrowserClient } from "@supabase/ssr";

// Used inside "use client" components. Reads the public (anon) key only —
// safe to expose, since Supabase row-level security enforces access control.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
