"use client";

import { useEffect, useState } from "react";
import { AssistantPanel } from "./AssistantPanel";

type Clip = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  transcriptExcerpt: string;
  hookScore: number;
  emotionScore: number;
  storytellingScore: number;
  viralScore: number;
  infoDensityScore: number;
  totalScore: number;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ShortRenderButton({ clipId }: { clipId: string }) {
  const [shortId, setShortId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "PROCESSING" | "READY" | "FAILED">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  async function startRender() {
    setStatus("PROCESSING");
    const res = await fetch(`/api/clips/${clipId}/render`, { method: "POST" });
    if (!res.ok) {
      setStatus("FAILED");
      setFailureReason("Could not start rendering.");
      return;
    }
    const data = await res.json();
    setShortId(data.shortId);
  }

  useEffect(() => {
    if (!shortId || status !== "PROCESSING") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/shorts/${shortId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setFailureReason(data.failureReason);
      setDownloadUrl(data.downloadUrl);
    }, 4000);
    return () => clearInterval(interval);
  }, [shortId, status]);

  if (status === "idle") {
    return (
      <button
        onClick={startRender}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
      >
        Create short
      </button>
    );
  }
  if (status === "PROCESSING") {
    return <span className="text-xs text-amber-400">Rendering short…</span>;
  }
  if (status === "FAILED") {
    return <span className="text-xs text-red-400">Failed: {failureReason}</span>;
  }
  return (
    <a
      href={downloadUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-medium text-emerald-400 underline"
    >
      Download short
    </a>
  );
}

export function ClipDetectionPanel({ videoId }: { videoId: string }) {
  const [status, setStatus] = useState<"idle" | "starting" | "PENDING" | "PROCESSING" | "READY" | "FAILED">(
    "idle"
  );
  const [clips, setClips] = useState<Clip[]>([]);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  async function startDetection() {
    setStatus("starting");
    const res = await fetch(`/api/videos/${videoId}/transcribe`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFailureReason(body.error ?? "Could not start transcription.");
      setStatus("FAILED");
      return;
    }
    setStatus("PROCESSING");
  }

  useEffect(() => {
    if (status !== "PROCESSING" && status !== "PENDING") return;

    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/videos/${videoId}/clips`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setStatus(data.transcriptStatus);
      setFailureReason(data.transcriptFailureReason);
      setClips(data.clips);
    }

    // Poll immediately (don't wait for the first 4s tick) so a finished
    // job shows up as soon as this effect mounts, not just on the next
    // interval tick — this is what was requiring a manual page reload.
    poll();
    const interval = setInterval(poll, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, videoId]);

  if (status === "idle") {
    return (
      <button
        onClick={startDetection}
        className="w-fit rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
      >
        Detect clips
      </button>
    );
  }

  if (status === "starting" || status === "PROCESSING" || status === "PENDING") {
    return (
      <p className="text-sm text-foreground/60">
        Transcribing and scoring moments — this can take a few minutes for
        longer videos…
      </p>
    );
  }

  if (status === "FAILED") {
    return (
      <p className="text-sm text-red-400">
        Clip detection failed: {failureReason ?? "Unknown error"}
      </p>
    );
  }

  if (clips.length === 0) {
    return <p className="text-sm text-foreground/40">No strong clip candidates found.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {clips.map((clip, i) => (
        <li key={clip.id} className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              #{i + 1} · {formatTime(clip.startSeconds)}–{formatTime(clip.endSeconds)}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-primary">
                Score {clip.totalScore.toFixed(0)}
              </span>
              <ShortRenderButton clipId={clip.id} />
            </div>
          </div>
          <p className="mb-3 text-sm text-foreground/70">&ldquo;{clip.transcriptExcerpt}&rdquo;</p>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-foreground/40">
            <span>Hook {clip.hookScore.toFixed(0)}</span>
            <span>Emotion {clip.emotionScore.toFixed(0)}</span>
            <span>Storytelling {clip.storytellingScore.toFixed(0)}</span>
            <span>Viral {clip.viralScore.toFixed(0)}</span>
            <span>Density {clip.infoDensityScore.toFixed(0)}</span>
          </div>
          <AssistantPanel defaultContext={clip.transcriptExcerpt} />
        </li>
      ))}
    </ul>
  );
}
