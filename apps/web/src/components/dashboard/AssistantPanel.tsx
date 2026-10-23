"use client";

import { useState } from "react";

const TASKS = [
  { value: "title", label: "Title ideas" },
  { value: "hashtags", label: "Hashtags" },
  { value: "description", label: "Description" },
  { value: "social_post", label: "Social post" },
  { value: "hook", label: "Hook lines" },
  { value: "cta", label: "CTA lines" },
  { value: "script_rewrite", label: "Rewrite script" },
];

export function AssistantPanel({ defaultContext }: { defaultContext: string }) {
  const [taskType, setTaskType] = useState(TASKS[0].value);
  const [context, setContext] = useState(defaultContext);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRun() {
    setIsLoading(true);
    setErrorMessage(null);
    setResult(null);

    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskType, context }),
    });

    setIsLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrorMessage(body.error ?? "Assistant request failed.");
      return;
    }

    const data = await res.json();
    setResult(data.result);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
        >
          {TASKS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleRun}
          disabled={isLoading}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isLoading ? "Thinking…" : "Ask AI (1 credit)"}
        </button>
      </div>
      {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
      {result && (
        <pre className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-foreground/80">
          {result}
        </pre>
      )}
    </div>
  );
}
