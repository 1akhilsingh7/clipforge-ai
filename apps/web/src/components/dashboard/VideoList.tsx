"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipDetectionPanel } from "./ClipDetectionPanel";

type VideoRow = {
  id: string;
  originalFilename: string;
  status: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  failureReason: string | null;
};

const statusColor: Record<string, string> = {
  UPLOADING: "text-foreground/40",
  PROCESSING: "text-amber-400",
  READY: "text-emerald-400",
  FAILED: "text-red-400",
};

function ThumbnailButton({ videoId }: { videoId: string }) {
  const [status, setStatus] = useState<"idle" | "PROCESSING" | "READY" | "FAILED">("idle");
  const [thumbnailId, setThumbnailId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  async function generate() {
    setStatus("PROCESSING");
    const res = await fetch(`/api/videos/${videoId}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestampSeconds: 1, overlayText: "", style: "BOLD_TEXT" }),
    });
    if (!res.ok) {
      setStatus("FAILED");
      return;
    }
    const data = await res.json();
    setThumbnailId(data.thumbnailId);
  }

  useEffect(() => {
    if (!thumbnailId || status !== "PROCESSING") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/thumbnails/${thumbnailId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setDownloadUrl(data.downloadUrl);
    }, 3000);
    return () => clearInterval(interval);
  }, [thumbnailId, status]);

  if (status === "idle") {
    return (
      <button onClick={generate} className="text-xs font-medium text-foreground/60 underline">
        Generate thumbnail
      </button>
    );
  }
  if (status === "PROCESSING") return <span className="text-xs text-amber-400">Generating…</span>;
  if (status === "FAILED") return <span className="text-xs text-red-400">Thumbnail failed</span>;
  return (
    <a href={downloadUrl ?? "#"} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 underline">
      View thumbnail
    </a>
  );
}

export function VideoList({
  projectId,
  initialVideos,
}: {
  projectId: string;
  initialVideos: VideoRow[];
}) {
  const [videos, setVideos] = useState(initialVideos);
  const router = useRouter();

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    const hasPending = videos.some(
      (v) => v.status === "UPLOADING" || v.status === "PROCESSING"
    );
    if (!hasPending) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [videos, projectId, router]);

  if (videos.length === 0) {
    return <p className="text-sm text-foreground/40">No videos uploaded yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {videos.map((video) => (
        <li key={video.id} className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between text-sm">
            <span>{video.originalFilename}</span>
            <div className="flex items-center gap-4">
              <span className={statusColor[video.status] ?? ""}>
                {video.status === "READY" && video.durationSeconds
                  ? `Ready · ${video.width}×${video.height} · ${video.durationSeconds.toFixed(1)}s`
                  : video.status === "FAILED"
                    ? `Failed: ${video.failureReason ?? "Unknown error"}`
                    : video.status}
              </span>
              {video.status === "READY" && <ThumbnailButton videoId={video.id} />}
            </div>
          </div>

          {video.status === "READY" && (
            <div className="mt-4 border-t border-border pt-4">
              <ClipDetectionPanel videoId={video.id} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
