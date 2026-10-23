import httpx


class UploadError(Exception):
    pass


async def download_to_tempfile(source_url: str, dest_path: str) -> None:
    async with httpx.AsyncClient(timeout=300.0) as client:
        async with client.stream("GET", source_url) as response:
            if response.status_code != 200:
                raise UploadError(f"Could not download source: {response.status_code}")
            with open(dest_path, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)


async def upload_rendered_short(local_path: str, signed_upload_url: str) -> None:
    with open(local_path, "rb") as f:
        data = f.read()

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.put(
            signed_upload_url,
            content=data,
            headers={"Content-Type": "video/mp4"},
        )
        if response.status_code not in (200, 201):
            raise UploadError(f"Upload failed with status {response.status_code}: {response.text[:500]}")
