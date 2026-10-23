"""
AI writing assistant: titles, hashtags, descriptions, social posts,
hooks, CTAs, script rewrites, and caption copy — all via one Claude
API integration with task-specific system prompts, rather than one
generic prompt reused everywhere (generic prompts produce generic,
same-sounding output across every task).

NOT TESTABLE IN THIS SANDBOX: no network access, no ANTHROPIC_API_KEY.
The request shape matches Anthropic's real /v1/messages API.
"""

import httpx

from app.config import settings

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-5"

TASK_PROMPTS: dict[str, str] = {
    "title": (
        "You write short-form video titles optimized for click-through "
        "without being misleading clickbait. Given the video context, "
        "return 5 title options, one per line, no numbering, no quotes."
    ),
    "hashtags": (
        "You write hashtag sets for short-form video platforms. Return "
        "10-15 relevant hashtags as a single space-separated line, mixing "
        "broad-reach and niche tags. No commentary."
    ),
    "description": (
        "You write short-form video descriptions: 1-2 punchy sentences "
        "plus a soft call-to-action. Return only the description text."
    ),
    "social_post": (
        "You write a social media post announcing this clip, matched to "
        "the platform's typical tone. Return only the post text."
    ),
    "hook": (
        "You write opening hook lines for short-form video scripts — the "
        "first sentence that stops someone from scrolling. Return 5 "
        "options, one per line, no numbering."
    ),
    "cta": (
        "You write short, natural call-to-action lines for the end of a "
        "short-form video. Return 5 options, one per line, no numbering."
    ),
    "script_rewrite": (
        "You rewrite the given script excerpt to be tighter and more "
        "engaging for short-form video, preserving the original meaning "
        "and speaker's voice. Return only the rewritten script."
    ),
}


class AssistantError(Exception):
    pass


async def run_assistant_task(task_type: str, context: str) -> str:
    if task_type not in TASK_PROMPTS:
        raise AssistantError(f"Unknown task type: {task_type}")

    if not settings.anthropic_api_key:
        raise AssistantError("ANTHROPIC_API_KEY is not configured.")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 600,
                "system": TASK_PROMPTS[task_type],
                "messages": [{"role": "user", "content": context}],
            },
        )

    if response.status_code != 200:
        raise AssistantError(f"Anthropic API error {response.status_code}: {response.text[:300]}")

    data = response.json()
    text_blocks = [block["text"] for block in data.get("content", []) if block.get("type") == "text"]
    if not text_blocks:
        raise AssistantError("No text content in Anthropic response")

    return "\n".join(text_blocks).strip()
