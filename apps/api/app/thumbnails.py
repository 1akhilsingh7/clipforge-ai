"""
Thumbnail generation: pull a real frame from the source video via
ffmpeg, then overlay text with PIL, styled per a small set of presets.

NOTE ON SCOPE: "AI-generated thumbnails", "background replacement", and
"face enhancement" from the spec need a person-segmentation model
(e.g. rembg/U2Net) and a face-restoration model (e.g. GFPGAN) respectively
- both require downloaded model weights this sandbox can't fetch. This
module implements the frame-extraction + text-overlay + style-preset
part for real now, and defines the extension point
(`enhance_and_replace_background`) where those models plug in once you
provision them - see the README for what that requires.
"""

import asyncio
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance


class ThumbnailError(Exception):
    pass


@dataclass
class ThumbnailStyleConfig:
    text_color: tuple[int, int, int] = (255, 255, 255)
    outline_color: tuple[int, int, int] = (0, 0, 0)
    font_size_ratio: float = 0.09  # relative to image height
    position: str = "bottom"  # "top" | "middle" | "bottom"
    contrast_boost: float = 1.0
    darken_background: float = 0.0  # 0-1, dims the frame so text pops


STYLE_PRESETS: dict[str, ThumbnailStyleConfig] = {
    "BOLD_TEXT": ThumbnailStyleConfig(font_size_ratio=0.11, darken_background=0.25),
    "MINIMAL": ThumbnailStyleConfig(font_size_ratio=0.07, darken_background=0.0),
    "CINEMATIC": ThumbnailStyleConfig(
        font_size_ratio=0.08, darken_background=0.35, contrast_boost=1.15
    ),
    "HIGH_CONTRAST": ThumbnailStyleConfig(
        text_color=(255, 230, 0), font_size_ratio=0.1, contrast_boost=1.3, darken_background=0.2
    ),
}


async def extract_frame(source_path: str, timestamp_seconds: float, output_path: str) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(timestamp_seconds),
        "-i", source_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path,
    ]
    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        raise ThumbnailError(stderr.decode(errors="replace")[-1000:])


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    # DejaVuSans-Bold ships with Pillow's default font search on most
    # Linux systems; fall back to Pillow's built-in bitmap font rather
    # than crashing if it's missing on a given host.
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def apply_text_overlay(
    frame_path: str, output_path: str, text: str, style_name: str = "BOLD_TEXT"
) -> None:
    style = STYLE_PRESETS.get(style_name, STYLE_PRESETS["BOLD_TEXT"])

    image = Image.open(frame_path).convert("RGB")

    if style.contrast_boost != 1.0:
        image = ImageEnhance.Contrast(image).enhance(style.contrast_boost)

    if style.darken_background > 0:
        overlay = Image.new("RGB", image.size, (0, 0, 0))
        image = Image.blend(image, overlay, style.darken_background)

    draw = ImageDraw.Draw(image)
    font_size = round(image.height * style.font_size_ratio)
    font = _load_font(font_size)

    # Wrap text so it doesn't run off the edges on long titles.
    max_width = image.width * 0.9
    words = text.upper().split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    line_height = font_size * 1.2
    total_text_height = line_height * len(lines)

    if style.position == "top":
        y = image.height * 0.06
    elif style.position == "middle":
        y = (image.height - total_text_height) / 2
    else:
        y = image.height - total_text_height - image.height * 0.06

    outline_width = max(2, font_size // 18)
    for line in lines:
        text_width = draw.textlength(line, font=font)
        x = (image.width - text_width) / 2
        # Simple outlined text (stroke) for legibility over busy frames.
        draw.text(
            (x, y), line, font=font, fill=style.text_color,
            stroke_width=outline_width, stroke_fill=style.outline_color,
        )
        y += line_height

    image.save(output_path, quality=92)


def enhance_and_replace_background(frame_path: str, output_path: str) -> None:
    """
    Extension point for "background replacement" and "face enhancement"
    from the spec. Both need real ML models this sandbox can't run:
      - Background replacement needs a person-segmentation model
        (e.g. rembg/U2Net) to separate subject from background.
      - Face enhancement needs a face-restoration model (e.g. GFPGAN).
    Not implemented yet — wire a real call to one of those here once
    you've provisioned GPU inference for it. Currently a passthrough so
    the pipeline doesn't silently no-op without you noticing.
    """
    raise NotImplementedError(
        "Background replacement / face enhancement need a segmentation "
        "and face-restoration model — see README Phase 6 notes."
    )
