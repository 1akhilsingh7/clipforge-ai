import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import videos, thumbnails, generation, assistant

app = FastAPI(
    title="ClipForge AI API",
    description="Video processing and AI services for ClipForge AI.",
    version="0.1.0",
    # Docs are useful in dev, but a public /docs page on a production API
    # is free reconnaissance for attackers — disable it once we ship.
    docs_url="/docs" if not settings.is_production else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


app.include_router(videos.router)
app.include_router(thumbnails.router)
app.include_router(generation.router)
app.include_router(assistant.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """
    Used by Railway/Render's health checks and by uptime monitoring.
    Returns 200 with no dependencies checked yet — Phase 3 (video import)
    will extend this to verify DB and storage connectivity too.
    """
    return {"status": "ok", "environment": settings.environment}
