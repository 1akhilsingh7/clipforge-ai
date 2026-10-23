"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { isAllowedVideoFile, MAX_UPLOAD_BYTES_FREE } from "@clipforge/config/upload-limits";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "processing" }
  | { phase: "done" }
  | { phase: "error"; message: string };

export function VideoUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!isAllowedVideoFile(file)) {
      setState({ phase: "error", message: "Use MP4, MOV, MKV, or AVI." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES_FREE) {
      setState({ phase: "error", message: "File exceeds the 2GB upload limit for your plan." });
      return;
    }

    setState({ phase: "uploading", progress: 0 });

    try {
      const createRes = await fetch("/api/videos/create-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not start upload.");
      }

      const { videoId, signedUrl } = await createRes.json();

      await uploadWithProgress(signedUrl, file, (progress) =>
        setState({ phase: "uploading", progress })
      );

      setState({ phase: "processing" });

      const completeRes = await fetch("/api/videos/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      if (!completeRes.ok) {
        throw new Error("Upload finished but processing failed to start.");
      }

      setState({ phase: "done" });
      router.refresh();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Upload failed.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="w-fit cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
        {state.phase === "idle" || state.phase === "error" || state.phase === "done"
          ? "Upload a video"
          : "Uploading…"}
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.mov,.mkv,.avi"
          className="hidden"
          onChange={handleFileChange}
          disabled={state.phase === "uploading" || state.phase === "processing"}
        />
      </label>

      {state.phase === "uploading" && (
        <div className="h-2 w-64 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      )}
      {state.phase === "processing" && (
        <p className="text-sm text-foreground/60">Reading video metadata…</p>
      )}
      {state.phase === "done" && (
        <p className="text-sm text-emerald-400">Uploaded successfully.</p>
      )}
      {state.phase === "error" && <p className="text-sm text-red-400">{state.message}</p>}
    </div>
  );
}

/**
 * Supabase's JS client doesn't expose upload progress, so we PUT to the
 * signed URL directly with a raw XHR — the only browser upload API that
 * gives real progress events.
 */
function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));

    xhr.send(file);
  });
}
