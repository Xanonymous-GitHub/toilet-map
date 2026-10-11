"""Measure cold production loads with reproducible tiles and Lighthouse."""

import asyncio
import json
import os
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-results"


async def measure(playwright, device, bun, chromium):
    port = int(os.environ.get("RELIEF_CDP_PORT", "9225"))
    with tempfile.TemporaryDirectory(prefix="relief-lighthouse-") as profile:
        context = await playwright.chromium.launch_persistent_context(
            profile,
            executable_path=chromium,
            headless=True,
            args=[
                "--no-sandbox",
                f"--remote-debugging-port={port}",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
            ],
        )
        try:

            async def tile(route):
                await route.fulfill(
                    content_type="image/png",
                    body=(ROOT / "tests/fixtures/basemap.png").read_bytes(),
                )

            await context.route("https://tile.openstreetmap.org/**", tile)
            args = [
                bun,
                "--bun",
                str(ROOT / "node_modules/lighthouse/cli/index.js"),
                os.environ.get("RELIEF_BASE_URL", "http://127.0.0.1:8787"),
                f"--port={port}",
                "--only-categories=performance,accessibility,best-practices",
                "--output=json",
                "--output=html",
                f"--output-path={OUT}/lighthouse-{device}",
                "--quiet",
            ]
            if device == "desktop":
                args.append("--preset=desktop")
            with (OUT / f"lighthouse-{device}.log").open("w") as log:
                process = await asyncio.create_subprocess_exec(
                    *args, stdout=log, stderr=log, cwd=ROOT
                )
                if await process.wait():
                    raise RuntimeError(f"Lighthouse {device} failed; see {log.name}")
            report = json.loads((OUT / f"lighthouse-{device}.report.json").read_text())
            result = {
                "device": device,
                "fixtureTiles": True,
                "url": report["finalDisplayedUrl"],
                "scores": {
                    key: round(value["score"] * 100) for key, value in report["categories"].items()
                },
                "metrics": {
                    key: report["audits"][key]["numericValue"]
                    for key in [
                        "largest-contentful-paint",
                        "total-blocking-time",
                        "cumulative-layout-shift",
                    ]
                },
                "transferBytes": sum(
                    item.get("transferSize", 0)
                    for item in report["audits"]["network-requests"]["details"]["items"]
                ),
            }
            print(json.dumps(result), flush=True)
            return result
        finally:
            await context.close()


async def main():
    OUT.mkdir(exist_ok=True)
    bun = shutil.which("bun")
    if not bun:
        raise RuntimeError("Install Bun before measuring the production build")
    chromium = os.environ.get("RELIEF_CHROMIUM_PATH") or shutil.which("chromium")
    async with async_playwright() as playwright:
        results = [
            await measure(playwright, device, bun, chromium) for device in ["mobile", "desktop"]
        ]
    (OUT / "performance-report.json").write_text(
        json.dumps(
            {
                "checkedAt": datetime.now(UTC).isoformat(),
                "lighthouse": json.loads(
                    (ROOT / "node_modules/lighthouse/package.json").read_text()
                )["version"],
                "environment": (
                    "Cold local production loads, gzip, deterministic tiles, "
                    "software WebGL, simulated Lighthouse throttling"
                ),
                "results": results,
            }
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
