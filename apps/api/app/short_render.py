"""
Renders a final vertical short from a source video + a chosen clip
window: trim -> face-centered 9:16 crop -> scale to 1080x1920 -> burn
in word-by-word captions. One ffmpeg invocation, one filter graph -
avoids the quality loss and slowdown of multiple re-encode passes.
"""

import asyncio
import shlex

from app.captions import CaptionStyle, generate_ass_captions
from app.face_crop import compute_crop_window, find_face_center_fraction


class RenderError(Exception):
    pass


async def render_short(
    source_path: str,
    clip_start: float,
    clip_end: float,
    source_width: int,
    source_height: int,
    words: list[dict],
    output_path: str,
    ass_path: str,
    caption_style: CaptionStyle = CaptionStyle(),
) -> None:
    face_fraction = find_face_center_fraction(source_path)
    crop = compute_crop_window(source_width, source_height, face_fraction)

    generate_ass_captions(words, clip_start, clip_end, ass_path, caption_style)

    # ffmpeg's subtitles/ass filter needs the path escaped for its own
    # mini-syntax (colons and backslashes are special inside filtergraphs).
    escaped_ass_path = ass_path.replace("\\", "\\\\").replace(":", "\\:")

    filter_graph = (
        f"crop={crop['width']}:{crop['height']}:{crop['x']}:{crop['y']},"
        f"scale=1080:1920,"
        f"ass='{escaped_ass_path}'"
    )

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(clip_start),
        "-to", str(clip_end),
        "-i", source_path,
        "-vf", filter_graph,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await process.communicate()

    if process.returncode != 0:
        raise RenderError(stderr.decode(errors="replace")[-2000:])
