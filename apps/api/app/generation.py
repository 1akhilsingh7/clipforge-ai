"""
AI image and video generation via Replicate's hosted models.

WHY REPLICATE: the spec asks for SDXL/FLUX (images) and CogVideoX/Wan/
HunyuanVideo (video) - all open-source models that normally need a GPU
to self-host. Replicate hosts all of them behind one consistent REST
API, which is the realistic way to ship this without provisioning and
maintaining your own GPU fleet on day one. Self-hosting remains an
option later (same interface, different `_run_prediction` implementation)
if volume justifies the infra cost.

NOT TESTABLE IN THIS SANDBOX: no network access to call Replicate's API,
and no API key configured. The request/response shapes below match
Replicate's actual documented API (POST /v1/predictions, poll until
status is "succeeded"/"failed") - verify against a real REPLICATE_API_TOKEN
before shipping.
"""

import asyncio

import httpx

from app.config import settings

REPLICATE_API_BASE = "https://api.replicate.com/v1"

# Pinned model versions matter on Replicate — "latest" isn't a stable
# API contract. Update these deliberately, not automatically.
SDXL_MODEL_VERSION = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08"
FLUX_MODEL_VERSION = "black-forest-labs/flux-schnell"
COGVIDEOX_MODEL_VERSION = "fofr/cogvideox-5b"


class GenerationError(Exception):
    pass


async def _run_prediction(model_version: str, input_payload: dict, timeout_seconds: int = 300) -> str:
    """
    Submits a prediction and polls until it completes. Returns the
    output URL. Raises GenerationError on failure or timeout.
    """
    headers = {
        "Authorization": f"Bearer {settings.replicate_api_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        create_res = await client.post(
            f"{REPLICATE_API_BASE}/predictions",
            headers=headers,
            json={"version": model_version, "input": input_payload},
        )
        if create_res.status_code not in (200, 201):
            raise GenerationError(f"Failed to start prediction: {create_res.text[:500]}")

        prediction = create_res.json()
        prediction_url = prediction["urls"]["get"]

        elapsed = 0
        poll_interval = 3
        while elapsed < timeout_seconds:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

            poll_res = await client.get(prediction_url, headers=headers)
            poll_data = poll_res.json()
            status = poll_data.get("status")

            if status == "succeeded":
                output = poll_data["output"]
                # Replicate returns either a single URL or a list depending
                # on the model — normalize to a single URL.
                return output[0] if isinstance(output, list) else output
            if status == "failed" or status == "canceled":
                raise GenerationError(poll_data.get("error", "Generation failed"))

        raise GenerationError(f"Generation timed out after {timeout_seconds}s")


async def generate_image(prompt: str, style_preset: str | None, aspect_ratio: str) -> str:
    """Returns a URL to the generated image (hosted on Replicate's CDN
    until you download and re-upload it to your own Storage bucket)."""
    enhanced_prompt = f"{prompt}, {style_preset} style" if style_preset else prompt

    width, height = _aspect_ratio_to_dimensions(aspect_ratio, base=1024)
    return await _run_prediction(
        FLUX_MODEL_VERSION,
        {"prompt": enhanced_prompt, "width": width, "height": height, "num_outputs": 1},
    )


async def generate_video(
    prompt: str, source_image_url: str | None, duration_seconds: int, aspect_ratio: str
) -> str:
    """Text-to-video if source_image_url is None, image-to-video otherwise."""
    payload: dict = {"prompt": prompt, "num_frames": duration_seconds * 8}
    if source_image_url:
        payload["image"] = source_image_url

    return await _run_prediction(COGVIDEOX_MODEL_VERSION, payload, timeout_seconds=600)


def _aspect_ratio_to_dimensions(aspect_ratio: str, base: int = 1024) -> tuple[int, int]:
    ratios = {
        "1:1": (base, base),
        "9:16": (round(base * 9 / 16 / 8) * 8, base),
        "16:9": (base, round(base * 9 / 16 / 8) * 8),
        "4:5": (round(base * 4 / 5 / 8) * 8, base),
    }
    return ratios.get(aspect_ratio, (base, base))
