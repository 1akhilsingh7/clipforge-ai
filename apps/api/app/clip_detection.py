"""
Scores candidate clips from a transcript's word-level timestamps.

This does NOT use an LLM — it's transparent, explainable heuristics,
which matters for a v1: "score clip on hook/emotion/storytelling/viral/
information density" is exactly the kind of thing you want to be able
to debug ("why did this 30s window score low?") rather than trust a
black box. An LLM-based re-ranker is a reasonable Phase 4.5 upgrade
once this baseline is shipped and you can compare against it.
"""

import re
from dataclasses import dataclass, field

WORD = dict  # {"word": str, "start": float, "end": float}

HOOK_PHRASES = [
    "here's why", "the truth is", "what nobody tells you", "did you know",
    "imagine", "picture this", "nobody talks about", "the secret to",
    "here's the thing", "let me tell you", "this changed everything",
    "you won't believe", "the reason why",
]

EMOTION_WORDS = [
    "amazing", "shocking", "incredible", "unbelievable", "insane", "crazy",
    "terrifying", "heartbreaking", "hilarious", "furious", "devastated",
    "thrilled", "obsessed", "love", "hate", "fear", "mistake", "regret",
    "never", "always", "worst", "best",
]

STORY_MARKERS = [
    "then", "after that", "suddenly", "but then", "first", "finally",
    "eventually", "turns out", "so i", "so we", "one day",
]

SENTENCE_END_RE = re.compile(r"[.!?]$")
NUMBER_LIST_RE = re.compile(r"\b\d+\s+(ways|tips|reasons|things|steps|secrets|mistakes)\b", re.I)


@dataclass
class Sentence:
    text: str
    start: float
    end: float
    pause_before: float


@dataclass
class ScoredClip:
    start_seconds: float
    end_seconds: float
    transcript_excerpt: str
    hook_score: float
    emotion_score: float
    storytelling_score: float
    viral_score: float
    info_density_score: float
    total_score: float = field(init=False)

    def __post_init__(self):
        self.total_score = round(
            self.hook_score * 0.25
            + self.emotion_score * 0.2
            + self.storytelling_score * 0.2
            + self.viral_score * 0.2
            + self.info_density_score * 0.15,
            1,
        )


def _clamp(value: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, value))


def build_sentences(words: list[WORD]) -> list[Sentence]:
    """Groups words into sentences using punctuation and pause gaps —
    a pause over 0.6s is treated as a sentence boundary even without
    punctuation, since spoken transcripts are often punctuation-sparse."""
    sentences: list[Sentence] = []
    current: list[WORD] = []
    prev_end = 0.0

    for w in words:
        pause = w["start"] - prev_end if current else 0.0
        if current and pause > 0.6:
            sentences.append(_flush(current, prev_pause=0.0))
            current = []
        current.append(w)
        prev_end = w["end"]
        if SENTENCE_END_RE.search(w["word"]):
            sentences.append(_flush(current, prev_pause=0.0))
            current = []

    if current:
        sentences.append(_flush(current, prev_pause=0.0))

    # backfill pause_before now that we know each sentence's true start
    for i in range(1, len(sentences)):
        sentences[i].pause_before = round(
            sentences[i].start - sentences[i - 1].end, 2
        )

    return sentences


def _flush(words: list[WORD], prev_pause: float) -> Sentence:
    text = " ".join(w["word"].strip() for w in words)
    return Sentence(text=text, start=words[0]["start"], end=words[-1]["end"], pause_before=prev_pause)


def _score_window(sentences: list[Sentence]) -> ScoredClip:
    text = " ".join(s.text for s in sentences).lower()
    duration = sentences[-1].end - sentences[0].start
    word_count = len(text.split())

    hook_hits = sum(1 for phrase in HOOK_PHRASES if phrase in text)
    # A hook lands hardest in the first sentence — weight it more there.
    hook_in_opening = any(phrase in sentences[0].text.lower() for phrase in HOOK_PHRASES)
    hook_score = _clamp(hook_hits * 25 + (20 if hook_in_opening else 0))

    emotion_hits = sum(text.count(w) for w in EMOTION_WORDS)
    exclamations = text.count("!")
    emotion_score = _clamp(emotion_hits * 15 + exclamations * 10)

    story_hits = sum(1 for marker in STORY_MARKERS if marker in text)
    personal_pronoun_hits = len(re.findall(r"\bi\b|\bwe\b|\byou\b", text))
    storytelling_score = _clamp(story_hits * 20 + min(personal_pronoun_hits, 10) * 3)

    list_pattern_hit = bool(NUMBER_LIST_RE.search(text))
    big_pause_before = sentences[0].pause_before > 1.5
    viral_score = _clamp(
        (30 if list_pattern_hit else 0)
        + (15 if big_pause_before else 0)
        + hook_score * 0.3
        + emotion_score * 0.3
    )

    # Words-per-second in a healthy speaking range (~2-3.5) scores
    # highest; too sparse (dead air) or too dense (rambling) scores lower.
    wps = word_count / duration if duration > 0 else 0
    info_density_score = _clamp(100 - abs(wps - 2.75) * 30)

    return ScoredClip(
        start_seconds=round(sentences[0].start, 2),
        end_seconds=round(sentences[-1].end, 2),
        transcript_excerpt=" ".join(s.text for s in sentences),
        hook_score=hook_score,
        emotion_score=emotion_score,
        storytelling_score=storytelling_score,
        viral_score=viral_score,
        info_density_score=info_density_score,
    )


def detect_clips(
    words: list[WORD],
    top_n: int = 5,
    min_duration: float = 15.0,
    max_duration: float = 60.0,
) -> list[ScoredClip]:
    """
    Slides a window over sentence boundaries (never cutting mid-sentence,
    since that produces unwatchable clips), scores each, and returns the
    top N non-overlapping candidates sorted by total_score descending.
    """
    sentences = build_sentences(words)
    if not sentences:
        return []

    candidates: list[ScoredClip] = []
    for i in range(len(sentences)):
        window: list[Sentence] = []
        for j in range(i, len(sentences)):
            window.append(sentences[j])
            duration = window[-1].end - window[0].start
            if duration < min_duration:
                continue
            if duration > max_duration:
                break
            candidates.append(_score_window(window))

    candidates.sort(key=lambda c: c.total_score, reverse=True)

    selected: list[ScoredClip] = []
    for candidate in candidates:
        overlaps = any(
            candidate.start_seconds < s.end_seconds and candidate.end_seconds > s.start_seconds
            for s in selected
        )
        if not overlaps:
            selected.append(candidate)
        if len(selected) >= top_n:
            break

    return selected
