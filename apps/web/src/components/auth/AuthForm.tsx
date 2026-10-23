"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  function validate(): string | null {
    if (!email.includes("@")) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setInfoMessage("Check your email to confirm your account.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (error) {
      // Supabase returns the same generic message for "no account" and
      // "wrong password" by design — don't leak which one it is.
      setErrorMessage("Invalid email or password.");
      return;
    }

    // OAuth and email-confirmation both sync via /auth/callback, but a
    // plain email/password login never hits that route — so sync here,
    // otherwise the dashboard would look for a users row that doesn't exist.
    await fetch("/api/users/sync", { method: "POST" });

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleAuth() {
    setErrorMessage(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <button
        type="button"
        onClick={handleGoogleAuth}
        className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium transition hover:bg-muted/70"
      >
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-foreground/40">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          className="rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary"
        />

        {errorMessage && (
          <p className="text-sm text-red-400" role="alert">
            {errorMessage}
          </p>
        )}
        {infoMessage && <p className="text-sm text-emerald-400">{infoMessage}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition disabled:opacity-50"
        >
          {isSubmitting
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
