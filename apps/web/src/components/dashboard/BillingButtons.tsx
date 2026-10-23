"use client";

import { useState } from "react";

export function UpgradeButton({ plan }: { plan: "PRO" | "BUSINESS" }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    setIsLoading(false);

    if (data.url) {
      window.location.href = data.url;
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="mt-6 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
    >
      {isLoading ? "Redirecting…" : `Upgrade to ${plan === "PRO" ? "Pro" : "Business"}`}
    </button>
  );
}

export function ManageBillingButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    setIsLoading(false);
    if (data.url) window.location.href = data.url;
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="mt-2 w-fit text-sm text-foreground/60 underline"
    >
      {isLoading ? "Redirecting…" : "Manage billing"}
    </button>
  );
}
