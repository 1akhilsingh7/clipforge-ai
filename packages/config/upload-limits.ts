// Single source of truth for video upload constraints. Imported by the
// client-side file picker (so users get instant feedback) AND the
// server route (which re-validates — client checks are UX, never security).

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-matroska", // .mkv
  "video/x-msvideo", // .avi
] as const;

export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi"] as const;

// Free plan cap. Pro/Business multipliers applied where this constant
// is used, once Stripe (Phase 8) makes `plan` meaningful.
export const MAX_UPLOAD_BYTES_FREE = 2 * 1024 * 1024 * 1024; // 2GB

export function isAllowedVideoFile(file: { type: string; name: string }): boolean {
  const hasAllowedMime = (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(file.type);
  const hasAllowedExtension = ALLOWED_VIDEO_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );
  // Browsers sometimes report an empty/wrong MIME type for .mkv, so
  // accept if EITHER check passes rather than requiring both.
  return hasAllowedMime || hasAllowedExtension;
}
