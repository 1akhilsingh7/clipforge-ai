from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import require_internal_auth
from app.clip_detection import detect_clips
from app.db import (
    create_pending_transcript,
    create_queued_short,
    get_clip_with_video,
    mark_short_failed,
    mark_short_ready,
    mark_video_failed,
    mark_video_ready,
    save_clips,
    save_transcript_failure,
    save_transcript_success,
)
from app.media import VideoProbeError, probe_video
from app.short_render import RenderError, render_short
from app.transcription import TranscriptionError, transcribe_from_url
from app.storage_upload import UploadError, download_to_tempfile, upload_rendered_short

router = APIRouter(prefix="/videos", tags=["videos"], dependencies=[Depends(require_internal_auth)])


class ProcessVideoRequest(BaseModel):
    sourceUrl: str


class TranscribeRequest(BaseModel):
    sourceUrl: str


class RenderShortRequest(BaseModel):
    shortId: str
    clipId: str
    sourceDownloadUrl: str
    uploadSignedUrl: str
    storagePath: str


@router.post("/{video_id}/process")
async def process_video(video_id: str, body: ProcessVideoRequest) -> dict[str, str]:
    """
    Phase 3 scope: extract real duration/width/height via ffprobe and
    persist them. This is intentionally NOT where clip detection,
    transcription, or cropping happen — those are Phase 4/5 and need
    the actual file bytes (ffprobe only reads headers), so they'll
    download from `sourceUrl` themselves when built.
    """
    try:
        metadata = await probe_video(body.sourceUrl)
    except VideoProbeError as exc:
        await mark_video_failed(video_id, str(exc))
        return {"status": "failed", "reason": str(exc)}

    await mark_video_ready(
        video_id,
        duration_seconds=metadata.duration_seconds,
        width=metadata.width,
        height=metadata.height,
    )
    return {"status": "ready"}


@router.post("/{video_id}/transcribe")
async def transcribe_video(video_id: str, body: TranscribeRequest) -> dict[str, str]:
    """
    Phase 4: transcribes the full video, then immediately runs clip
    detection against the resulting word timestamps — these two always
    happen together since clip detection has nothing to score without
    a transcript.
    """
    await create_pending_transcript(video_id)

    try:
        language, full_text, words = await transcribe_from_url(body.sourceUrl)
    except TranscriptionError as exc:
        await save_transcript_failure(video_id, str(exc))
        return {"status": "failed", "reason": str(exc)}

    await save_transcript_success(video_id, language, full_text, words)

    clips = detect_clips(words, top_n=5)
    await save_clips(
        video_id,
        [
            {
                "start_seconds": c.start_seconds,
                "end_seconds": c.end_seconds,
                "transcript_excerpt": c.transcript_excerpt,
                "hook_score": c.hook_score,
                "emotion_score": c.emotion_score,
                "storytelling_score": c.storytelling_score,
                "viral_score": c.viral_score,
                "info_density_score": c.info_density_score,
                "total_score": c.total_score,
            }
            for c in clips
        ],
    )

    return {"status": "ready", "clips_found": str(len(clips))}


@router.post("/shorts/render")
async def render_short_endpoint(body: RenderShortRequest) -> dict[str, str]:
    """
    Phase 5: renders the actual vertical short for a chosen clip -
    downloads the source, detects the face position, crops to 9:16,
    burns in word-by-word captions, and uploads the MP4 back to
    Supabase via the signed URL Next.js prepared for it.
    """
    import os
    import tempfile
    import uuid

    row = await get_clip_with_video(body.clipId)
    if row is None:
        await mark_short_failed(body.shortId, "Clip not found")
        return {"status": "failed", "reason": "Clip not found"}

    words = row["words"] or []

    with tempfile.TemporaryDirectory() as tmp_dir:
        source_path = os.path.join(tmp_dir, "source.mp4")
        output_path = os.path.join(tmp_dir, "output.mp4")
        ass_path = os.path.join(tmp_dir, f"{uuid.uuid4()}.ass")

        try:
            await download_to_tempfile(body.sourceDownloadUrl, source_path)

            await render_short(
                source_path=source_path,
                clip_start=row["startSeconds"],
                clip_end=row["endSeconds"],
                source_width=row["width"],
                source_height=row["height"],
                words=words,
                output_path=output_path,
                ass_path=ass_path,
            )

            # Upload via the signed PUT URL Next.js prepared, but record
            # the plain storage path in the DB — the signed URL expires,
            # the path doesn't.
            from app.storage_upload import upload_rendered_short

            await upload_rendered_short(output_path, body.uploadSignedUrl)

        except (UploadError, RenderError) as exc:
            await mark_short_failed(body.shortId, str(exc)[:500])
            return {"status": "failed", "reason": str(exc)[:500]}

    await mark_short_ready(body.shortId, body.storagePath)
    return {"status": "ready"}
