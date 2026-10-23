"""
Builds .ass subtitle files with word-by-word highlighting, burned into
the output via ffmpeg's `ass` filter. ASS (Advanced SubStation Alpha) is
used instead of plain SRT because it supports per-word karaoke timing
and full styling (font/size/color/position) — exactly what "word-by-word
animation" and "color customization" in the spec require, and SRT can't
do either.
"""

from dataclasses import dataclass


@dataclass
class CaptionStyle:
    font_name: str = "Arial"
    font_size: int = 72
    primary_color: str = "&H00FFFFFF"  # ASS BGR hex: white
    highlight_color: str = "&H0000D7FF"  # gold, used for the active word
    position: str = "bottom"  # "bottom" | "middle" | "top"


def _seconds_to_ass_timestamp(seconds: float) -> str:
    centiseconds = round(seconds * 100)
    hours, remainder = divmod(centiseconds, 360000)
    minutes, remainder = divmod(remainder, 6000)
    secs, cs = divmod(remainder, 100)
    return f"{hours:d}:{minutes:02d}:{secs:02d}.{cs:02d}"


def _alignment_for_position(position: str) -> int:
    # ASS numpad-style alignment codes: 2 = bottom-center, 8 = top-center,
    # 5 = middle-center.
    return {"bottom": 2, "top": 8, "middle": 5}.get(position, 2)


def _group_words_into_caption_lines(
    words: list[dict], clip_start: float, max_words_per_line: int = 4
) -> list[list[dict]]:
    """Groups words into short on-screen lines (short-form captions read
    a few words at a time, not full sentences) with timestamps rebased
    to be relative to the clip's own start, not the source video's."""
    lines: list[list[dict]] = []
    current: list[dict] = []

    for word in words:
        if word["start"] < clip_start:
            continue
        rebased = {
            "word": word["word"].strip(),
            "start": word["start"] - clip_start,
            "end": word["end"] - clip_start,
        }
        current.append(rebased)
        if len(current) >= max_words_per_line:
            lines.append(current)
            current = []

    if current:
        lines.append(current)

    return lines


def generate_ass_captions(
    words: list[dict],
    clip_start: float,
    clip_end: float,
    output_path: str,
    style: CaptionStyle = CaptionStyle(),
) -> None:
    clip_duration = clip_end - clip_start
    lines = _group_words_into_caption_lines(
        [w for w in words if w["start"] < clip_end], clip_start
    )

    alignment = _alignment_for_position(style.position)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Alignment, MarginV
Style: Default,{style.font_name},{style.font_size},{style.primary_color},{style.highlight_color},&H00000000,&H80000000,1,{alignment},120

[Events]
Format: Layer, Start, End, Style, Text
"""

    events: list[str] = []
    for line_words in lines:
        if not line_words:
            continue
        line_start = max(0.0, line_words[0]["start"])
        line_end = min(clip_duration, line_words[-1]["end"])
        if line_end <= line_start:
            continue

        # \k tags give word-by-word karaoke highlighting — each \kNN
        # is that word's duration in centiseconds before the highlight
        # advances to the next word.
        karaoke_parts = []
        for w in line_words:
            duration_cs = max(1, round((w["end"] - w["start"]) * 100))
            karaoke_parts.append(f"{{\\k{duration_cs}}}{w['word']}")
        text = " ".join(karaoke_parts)

        events.append(
            f"Dialogue: 0,{_seconds_to_ass_timestamp(line_start)},"
            f"{_seconds_to_ass_timestamp(line_end)},Default,{text}"
        )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("\n".join(events))
