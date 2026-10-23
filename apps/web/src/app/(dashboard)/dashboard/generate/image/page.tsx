"use client";

import { useEffect, useState } from "react";

const STYLE_PRESETS = ["Photorealistic", "Cinematic", "Anime", "3D Render", "Watercolor"];
const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:5"];

export default function ImageGeneratorPage() {
  const [prompt, setPrompt] = useState("");
  const [stylePreset, setStylePreset] = useState(STYLE_PRESETS[0]);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageId, setImageId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "PROCESSING" | "READY" | "FAILED">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setErrorMessage(null);
    setStatus("PROCESSING");
    const res = await fetch("/api/generate/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, stylePreset, aspectRatio }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrorMessage(body.error ?? "Could not start generation.");
      setStatus("FAILED");
      return;
    }
    const data = await res.json();
    setImageId(data.imageId);
  }

  useEffect(() => {
    if (!imageId || status !== "PROCESSING") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/generate/image/${imageId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setDownloadUrl(data.downloadUrl);
      setErrorMessage(data.failureReason);
    }, 4000);
    return () => clearInterval(interval);
  }, [imageId, status]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">AI Image Generator</h1>
      <p className="text-sm text-foreground/50">
        Generates via a hosted FLUX model. 5 credits per image.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the image you want…"
        rows={3}
        maxLength={1000}
        className="rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary"
      />

      <div className="flex flex-wrap gap-2">
        {STYLE_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setStylePreset(preset)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              stylePreset === preset ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {preset}
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={downloadUrl} alt={prompt} className="rounded-lg border border-border" />
      )}
    </div>
  );
}
