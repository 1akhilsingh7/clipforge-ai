from fastapi import Header, HTTPException

from app.config import settings


async def require_internal_auth(authorization: str | None = Header(default=None)) -> None:
    """
    This API is not meant to be called by end users directly — only by
    our own Next.js server, which holds API_SECRET_KEY. This is
    deliberately simple (a shared secret, not per-user JWT validation)
    because the caller here is a trusted service, not a browser.
    Per-user permission checks already happened in Next.js before this
    request was made.
    """
    expected = f"Bearer {settings.api_secret_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing internal auth token")
