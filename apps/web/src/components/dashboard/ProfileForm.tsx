"use client";

import { useState, type FormEvent } from "react";

export function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");

    const res = await fetch("/api/users/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });

    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      <label className="text-sm text-foreground/70" htmlFor="displayName">
        Display name
      </label>
      <input
        id="displayName"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={80}
        className="rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && <p className="text-sm text-emerald-400">Saved.</p>}
      {status === "error" && <p className="text-sm text-red-400">Couldn&apos;t save. Try again.</p>}
    </form>
  );
}
