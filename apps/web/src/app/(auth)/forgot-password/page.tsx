"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?redirectedFrom=/reset-password`,
    });

    setIsSubmitting(false);
    // Always show the same "sent" state regardless of whether the email
    // exists — otherwise this endpoint becomes a way to enumerate which
    // emails have accounts.
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>

      {status === "sent" ? (
        <p className="max-w-sm text-center text-sm text-foreground/70">
          If an account exists for {email}, a reset link is on its way.
          Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? "Sending…" : "Send reset link"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-400">
              Something went wrong. Try again in a moment.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
