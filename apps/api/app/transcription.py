"""
Transcription via faster-whisper.

NOTE ON TESTING: this module cannot be exercised in the build sandbox —
it requires downloading model weights (network) and benefits enormously
from a GPU for anything beyond toy clips. The code below matches
faster-whisper's actual documented API (WhisperModel.transcribe with
word_timestamps=True), but you should run the "Testing this phase"
checklist in the README on a real machine before trusting it in prod.
"""

import asyncio
import tempfile

import httpx
from faster_whisper import WhisperModel

from app.config import settings

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        # "small" is a reasonable CPU-friendly default for local dev.
        # Swap to "medium"/"large-v3" with device="cuda" in production
        # for materially better accuracy — set via env so it's a config
        # change, not a code change, when you provision a GPU box.
        _model = WhisperModel(
            settings.whisper_model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _model


class TranscriptionError(Exception):
    pass


async def transcribe_from_url(source_url: str) -> tuple[str, str, list[dict]]:
    """
    Downloads the video/audio from a signed URL to a temp file (faster-whisper
    needs a local path — it doesn't accept a remote URL directly), runs
    transcription, and returns (language, full_text, words).

    `words` is a list of {"word": str, "start": float, "end": float}
    dicts — the exact shape clip_detection.detect_clips() expects.
    """
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.get(source_url)
        if response.status_code != 200:
            raise TranscriptionError(f"Could not download source file: {response.status_code}")

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
            tmp.write(response.content)
            tmp.flush()

            # faster-whisper is synchronous/CPU-or-GPU-bound; run it in a
            # thread so it doesn't block the FastAPI event loop.
            def _run_transcription():
                model = _get_model()
                segments, info = model.transcribe(tmp.name, word_timestamps=True)
                words: list[dict] = []
                full_text_parts: list[str] = []
                for segment in segments:
                    full_text_parts.append(segment.text.strip())
                    for word in segment.words or []:
                        words.append(
                            {"word": word.word, "start": word.start, "end": word.end}
                        )
                return info.language, " ".join(full_text_parts), words

            language, full_text, words = await asyncio.to_thread(_run_transcription)

    if not words:
        raise TranscriptionError("Transcription produced no words — check audio track exists")

    return language, full_text, words
