"""Deterministic OpenFreeMap assets for UI and offline browser checks."""

import urllib.request
from pathlib import Path
from urllib.parse import urlparse

BASEMAP_HOST = "tiles.openfreemap.org"
FIXTURES = Path(__file__).resolve().parent.parent / "tests/fixtures"


def basemap_fixture(url):
    path = urlparse(url).path
    if path in {"/styles/bright", "/styles/dark"}:
        name = path.rsplit("/", 1)[1]
        return {
            "status": 200,
            "content_type": "application/json",
            "body": (FIXTURES / f"openfreemap-{name}.json").read_bytes(),
        }
    if path.startswith("/fixtures/") and path.endswith(".pbf"):
        return {
            "status": 200,
            "content_type": "application/x-protobuf",
            "body": (FIXTURES / "basemap.pbf").read_bytes(),
        }
    return {"status": 404, "body": "Unexpected basemap fixture request"}


def verified_basemap(route):
    """Bridge real upstream bytes through the session's CA-verified HTTP proxy."""
    request = urllib.request.Request(
        route.request.url,
        headers={
            "User-Agent": route.request.headers.get("user-agent", "ToiletMap QA/1.0"),
            "Referer": route.request.headers.get("referer", ""),
            "Accept": route.request.headers.get("accept", "*/*"),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            route.fulfill(
                status=response.status,
                headers={
                    key: value
                    for key, value in response.headers.items()
                    if key.lower() not in {"content-length", "transfer-encoding", "connection"}
                },
                body=response.read(),
            )
    except Exception:
        route.abort()
