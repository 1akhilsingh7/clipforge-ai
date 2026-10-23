"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setIsSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrorMessage(body.error ?? "Could not create project.");
      return;
    }

    const { project } = await res.json();
    setName("");
    router.push(`/dashboard/projects/${project.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name"
        maxLength={120}
        required
        className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? "Creating…" : "Create"}
      </button>
      {errorMessage && <p className="self-center text-sm text-red-400">{errorMessage}</p>}
    </form>
  );
}
