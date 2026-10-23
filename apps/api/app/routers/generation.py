import os
import tempfile

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import require_internal_auth
from app.db import mark_generated_image, mark_generated_video
from app.generation import GenerationError, generate_image, generate_video
from app.storage_upload import UploadError, upload_rendered_short

router = APIRouter(prefix="/generation", tags=["generation"], dependencies=[Depends(require_internal_auth)])


class GenerateImageRequest(BaseModel):
    imageId: str
    prompt: str
    stylePreset: str | None
    aspectRatio: str
    uploadSignedUrl: str
    storagePath: str


class GenerateVideoRequest(BaseModel):
    videoId: str
    prompt: str
    sourceImageUrl: str | None
    durationSeconds: int
    aspectRatio: str
    uploadSignedUrl: str
    storagePath: str


async def _download(url: str, dest: str) -> None:
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.get(url)
        res.raise_for_status()
        with open(dest, "wb") as f:
            f.write(res.content)


@router.post("/images")
async def create_image(body: GenerateImageRequest) -> dict[str, str]:
    try:
        replicate_url = await generate_image(body.prompt, body.stylePreset, body.aspectRatio)

        with tempfile.TemporaryDirectory() as tmp_dir:
            local_path = os.path.join(tmp_dir, "image.png")
            await _download(replicate_url, local_path)
            await upload_rendered_short(local_path, body.uploadSignedUrl)

        await mark_generated_image(body.imageId, "READY", body.storagePath)
        return {"status": "ready"}
    except (GenerationError, UploadError) as exc:
        await mark_generated_image(body.imageId, "FAILED", None, str(exc)[:500])
        return {"status": "failed", "reason": str(exc)[:500]}


@router.post("/videos")
async def create_video(body: GenerateVideoRequest) -> dict[str, str]:
    try:
        replicate_url = await generate_video(
            body.prompt, body.sourceImageUrl, body.durationSeconds, body.aspectRatio
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            local_path = os.path.join(tmp_dir, "video.mp4")
            await _download(replicate_url, local_path)
            await upload_rendered_short(local_path, body.uploadSignedUrl)

        await mark_generated_video(body.videoId, "READY", body.storagePath)
        return {"status": "ready"}
    except (GenerationError, UploadError) as exc:
        await mark_generated_video(body.videoId, "FAILED", None, str(exc)[:500])
        return {"status": "failed", "reason": str(exc)[:500]}
