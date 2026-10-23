import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    return _pool


async def create_queued_short(clip_id: str) -> str:
    import uuid

    pool = await get_pool()
    short_id = str(uuid.uuid4())
    await pool.execute(
        """
        INSERT INTO shorts (id, "clipId", status, "createdAt", "updatedAt")
        VALUES ($1, $2, 'PROCESSING', now(), now())
        """,
        short_id,
        clip_id,
    )
    return short_id


async def mark_short_ready(short_id: str, storage_path: str) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE shorts SET status = 'READY', "storagePath" = $2, "updatedAt" = now()
        WHERE id = $1
        """,
        short_id,
        storage_path,
    )


async def mark_short_failed(short_id: str, reason: str) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE shorts SET status = 'FAILED', "failureReason" = $2, "updatedAt" = now()
        WHERE id = $1
        """,
        short_id,
        reason,
    )


async def get_clip_with_video(clip_id: str):
    pool = await get_pool()
    return await pool.fetchrow(
        """
        SELECT c.id, c."startSeconds", c."endSeconds", c."videoId",
               v.width, v.height,
               t.words
        FROM clips c
        JOIN videos v ON v.id = c."videoId"
        LEFT JOIN transcripts t ON t."videoId" = v.id
        WHERE c.id = $1
        """,
        clip_id,
    )


async def mark_video_ready(video_id: str, duration_seconds: float, width: int, height: int) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE videos
        SET status = 'READY',
            "durationSeconds" = $2,
            width = $3,
            height = $4,
            "updatedAt" = now()
        WHERE id = $1
        """,
        video_id,
        duration_seconds,
        width,
        height,
    )


async def mark_video_failed(video_id: str, reason: str) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE videos
        SET status = 'FAILED',
            "failureReason" = $2,
            "updatedAt" = now()
        WHERE id = $1
        """,
        video_id,
        reason,
    )


async def mark_thumbnail_ready(thumbnail_id: str, storage_path: str) -> None:
    pool = await get_pool()
    await pool.execute(
        """UPDATE thumbnails SET status='READY', "storagePath"=$2, "updatedAt"=now() WHERE id=$1""",
        thumbnail_id, storage_path,
    )


async def mark_thumbnail_failed(thumbnail_id: str, reason: str) -> None:
    pool = await get_pool()
    await pool.execute(
        """UPDATE thumbnails SET status='FAILED', "failureReason"=$2, "updatedAt"=now() WHERE id=$1""",
        thumbnail_id, reason,
    )


async def mark_generated_image(image_id: str, status: str, storage_path: str | None = None, reason: str | None = None) -> None:
    pool = await get_pool()
    await pool.execute(
        """UPDATE generated_images SET status=$2, "storagePath"=$3, "failureReason"=$4, "updatedAt"=now() WHERE id=$1""",
        image_id, status, storage_path, reason,
    )


async def mark_generated_video(video_id: str, status: str, storage_path: str | None = None, reason: str | None = None) -> None:
    pool = await get_pool()
    await pool.execute(
        """UPDATE generated_videos SET status=$2, "storagePath"=$3, "failureReason"=$4, "updatedAt"=now() WHERE id=$1""",
        video_id, status, storage_path, reason,
    )


async def create_pending_transcript(video_id: str) -> str:
    import uuid

    pool = await get_pool()
    transcript_id = str(uuid.uuid4())
    await pool.execute(
        """
        INSERT INTO transcripts (id, "videoId", status, "createdAt", "updatedAt")
        VALUES ($1, $2, 'PROCESSING', now(), now())
        ON CONFLICT ("videoId") DO UPDATE SET status = 'PROCESSING', "updatedAt" = now()
        """,
        transcript_id,
        video_id,
    )
    return transcript_id


async def save_transcript_success(video_id: str, language: str, full_text: str, words: list[dict]) -> None:
    import json

    pool = await get_pool()
    await pool.execute(
        """
        UPDATE transcripts
        SET status = 'READY', language = $2, "fullText" = $3, words = $4::jsonb, "updatedAt" = now()
        WHERE "videoId" = $1
        """,
        video_id,
        language,
        full_text,
        json.dumps(words),
    )


async def save_transcript_failure(video_id: str, reason: str) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE transcripts
        SET status = 'FAILED', "failureReason" = $2, "updatedAt" = now()
        WHERE "videoId" = $1
        """,
        video_id,
        reason,
    )


async def save_clips(video_id: str, clips: list[dict]) -> None:
    import uuid

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Clip detection can be re-run (e.g. user asks to regenerate),
            # so previous candidates are replaced rather than appended.
            await conn.execute('DELETE FROM clips WHERE "videoId" = $1', video_id)
            for clip in clips:
                await conn.execute(
                    """
                    INSERT INTO clips (
                        id, "videoId", "startSeconds", "endSeconds", "transcriptExcerpt",
                        "hookScore", "emotionScore", "storytellingScore", "viralScore",
                        "infoDensityScore", "totalScore", "createdAt"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
                    """,
                    str(uuid.uuid4()),
                    video_id,
                    clip["start_seconds"],
                    clip["end_seconds"],
                    clip["transcript_excerpt"],
                    clip["hook_score"],
                    clip["emotion_score"],
                    clip["storytelling_score"],
                    clip["viral_score"],
                    clip["info_density_score"],
                    clip["total_score"],
                )
