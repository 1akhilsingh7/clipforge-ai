import sys

sys.path.insert(0, ".")
from app.clip_detection import detect_clips


def _words_from_sentence(sentence: str, start: float, wps: float = 2.5):
    tokens = sentence.split()
    words = []
    t = start
    for tok in tokens:
        dur = 1 / wps
        words.append({"word": tok, "start": round(t, 2), "end": round(t + dur, 2)})
        t += dur
    return words, t


def _build_transcript(script: list[tuple[str, float]]) -> list[dict]:
    words: list[dict] = []
    t = 0.0
    for sentence, pause_after in script:
        new_words, t = _words_from_sentence(sentence, t)
        words.extend(new_words)
        t += pause_after
    return words


def test_viral_segment_scores_above_boring_filler():
    script = [
        ("So today I want to talk about my morning routine.", 4.0),
        ("I usually wake up around seven and make coffee.", 1.0),
        ("It's pretty normal, nothing special really.", 1.0),
        ("Here's the thing nobody tells you about failure.", 2.5),
        ("The first time I went bankrupt I felt completely destroyed.", 1.0),
        ("But then something incredible happened that changed everything.", 1.0),
        ("I discovered 5 mistakes that were costing me everything!", 0.8),
    ]
    words = _build_transcript(script)
    clips = detect_clips(words, top_n=5, min_duration=5, max_duration=30)

    assert len(clips) >= 2, "Expected at least two non-overlapping candidate clips"

    top_clip = clips[0]
    boring_clip = next(
        (c for c in clips if "morning routine" in c.transcript_excerpt or "coffee" in c.transcript_excerpt),
        None,
    )

    assert boring_clip is not None, "Expected the filler segment to appear as a low-ranked candidate"
    assert top_clip.total_score > boring_clip.total_score, (
        "The hook/emotion-rich segment should outscore plain filler content"
    )
    assert top_clip.hook_score > 0, "Segment containing a hook phrase should score on hook_score"
    assert top_clip.emotion_score > 0, "Segment containing emotion words should score on emotion_score"


def test_empty_transcript_returns_no_clips():
    assert detect_clips([], top_n=5) == []


def test_clips_never_overlap():
    script = [
        ("Here's the thing nobody tells you about money.", 1.0),
        ("Did you know most millionaires started with nothing?", 1.0),
        ("The secret to wealth is boring consistent habits every single day.", 1.0),
        ("You won't believe how simple the actual math really is.", 1.0),
    ]
    words = _build_transcript(script)
    clips = detect_clips(words, top_n=5, min_duration=3, max_duration=15)

    for a in clips:
        for b in clips:
            if a is b:
                continue
            overlaps = a.start_seconds < b.end_seconds and a.end_seconds > b.start_seconds
            assert not overlaps, f"Clips overlap: {a} and {b}"
