import os
import tempfile

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import require_internal_auth
from app.db import mark_thumbnail_failed, mark_thumbnail_ready
from app.storage_upload import UploadError, download_to_tempfile, upload_rendered_short
from app.thumbnails import ThumbnailError, apply_text_overlay, extract_frame

router = APIRouter(prefix="/thumbnails", tags=["thumbnails"], dependencies=[Depends(require_internal_auth)])


class GenerateThumbnailRequest(BaseModel):
    thumbnailId: str
    sourceDownloadUrl: str
    uploadSignedUrl: str
    storagePath: str
    timestampSeconds: float
    overlayText: str | None
    style: str = "BOLD_TEXT"


@router.post("/generate")
async def generate_thumbnail(body: GenerateThumbnailRequest) -> dict[str, str]:
    with tempfile.TemporaryDirectory() as tmp_dir:
        source_path = os.path.join(tmp_dir, "source.mp4")
        frame_path = os.path.join(tmp_dir, "frame.jpg")
        output_path = os.path.join(tmp_dir, "thumbnail.jpg")

        try:
            await download_to_tempfile(body.sourceDownloadUrl, source_path)
            await extract_frame(source_path, body.timestampSeconds, frame_path)

            if body.overlayText:
                apply_text_overlay(frame_path, output_path, body.overlayText, body.style)
            else:
                os.rename(frame_path, output_path)

            await upload_rendered_short(output_path, body.uploadSignedUrl)

        except (ThumbnailError, UploadError) as exc:
            await mark_thumbnail_failed(body.thumbnailId, str(exc)[:500])
            return {"status": "failed", "reason": str(exc)[:500]}

    await mark_thumbnail_ready(body.thumbnailId, body.storagePath)
    return {"status": "ready"}
