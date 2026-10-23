"use client";

import { useState } from "react";

export function FeatureFlagToggle({
  flagKey,
  enabled,
  description,
}: {
  flagKey: string;
  enabled: boolean;
  description: string | null;
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);

  async function toggle() {
    setIsSaving(true);
    const next = !isEnabled;
    const res = await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: flagKey, enabled: next }),
    });
    setIsSaving(false);
    if (res.ok) setIsEnabled(next);
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">{flagKey}</p>
        {description && <p className="text-xs text-foreground/40">{description}</p>}
      </div>
      <button
        onClick={toggle}
        disabled={isSaving}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          isEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-foreground/50"
        }`}
      >
        {isEnabled ? "Enabled" : "Disabled"}
      </button>
    </div>
  );
}
