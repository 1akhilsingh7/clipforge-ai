import asyncio
import json
from dataclasses import dataclass


class VideoProbeError(Exception):
    """Raised when ffprobe can't read the file - e.g. corrupt upload,
    unsupported codec, or a file that isn't actually a video."""


@dataclass
class VideoMetadata:
    duration_seconds: float
    width: int
    height: int


async def probe_video(source_url: str) -> VideoMetadata:
    """
    Runs ffprobe against a URL or local path and extracts the metadata
    we need before any further processing (crop/caption/clip-detection
    all depend on knowing real dimensions and duration).

    ffprobe can read directly from a signed HTTPS URL without
    downloading the whole file first, which matters once videos are
    multiple GB.
    """
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        source_url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise VideoProbeError(stderr.decode(errors="replace").strip() or "ffprobe failed")

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise VideoProbeError("ffprobe returned unparseable output") from exc

    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    if video_stream is None:
        raise VideoProbeError("No video stream found in file")

    format_info = data.get("format", {})
    duration_raw = format_info.get("duration") or video_stream.get("duration")
    if duration_raw is None:
        raise VideoProbeError("Could not determine video duration")

    return VideoMetadata(
        duration_seconds=float(duration_raw),
        width=int(video_stream["width"]),
        height=int(video_stream["height"]),
    )
