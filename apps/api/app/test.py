import asyncio

async def main():
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-version"
    )
    await process.wait()
    print("SUCCESS")

asyncio.run(main())