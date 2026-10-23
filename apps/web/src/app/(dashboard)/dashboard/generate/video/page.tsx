"use client";

import { useEffect, useState } from "react";

const DURATIONS = [3, 5, 8];
const ASPECT_RATIOS = ["9:16", "16:9", "1:1"];

export default function VideoGeneratorPage() {
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [videoGenId, setVideoGenId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "PROCESSING" | "READY" | "FAILED">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setErrorMessage(null);
    setStatus("PROCESSING");
    const res = await fetch("/api/generate/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, durationSeconds, aspectRatio }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrorMessage(body.error ?? "Could not start generation.");
      setStatus("FAILED");
      return;
    }
    const data = await res.json();
    setVideoGenId(data.videoGenId);
  }

  useEffect(() => {
    if (!videoGenId || status !== "PROCESSING") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/generate/video/${videoGenId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setDownloadUrl(data.downloadUrl);
      setErrorMessage(data.failureReason);
    }, 5000);
    return () => clearInterval(interval);
  }, [videoGenId, status]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">AI Video Generator</h1>
      <p className="text-sm text-foreground/50">
        Text-to-video via a hosted CogVideoX model. 25 credits per video.
        Generation can take several minutes.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the video you want…"
        rows={3}
        maxLength={1000}
        className="rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary"
      />

      <div className="flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDurationSeconds(d)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              durationSeconds === d ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {d}s
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {ASPECT_RATIOS.map((ratio) => (
          <button
            key={ratio}
            onClick={() => setAspectRatio(ratio)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              aspectRatio === ratio ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {ratio}
          </button>
        ))}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!prompt || status === "PROCESSING"}
        className="w-fit rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "PROCESSING" ? "Generating…" : "Generate"}
      </button>

      {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}

      {status === "READY" && downloadUrl && (
        <video src={downloadUrl} controls className="rounded-lg border border-border" />
      )}
    </div>
  );
}
