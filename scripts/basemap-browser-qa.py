"""Check provider failures, recovery and optional real vector maps."""

import atexit
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from map_assets import BASEMAP_HOST, basemap_fixture, verified_basemap
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
BASE_URL = os.environ.get("RELIEF_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
CHROMIUM = os.environ.get("RELIEF_CHROMIUM_PATH")
if not CHROMIUM and Path("/usr/bin/chromium").exists():
    CHROMIUM = "/usr/bin/chromium"
REAL_MAP = os.environ.get("RELIEF_QA_REAL_BASEMAP") == "1"
REPORT = {
    "startedAt": datetime.now(UTC).isoformat(),
    "passed": False,
    "realMap": REAL_MAP,
    "checks": [],
    "pageErrors": [],
    "externalResponses": [],
}


def save_report():
    (OUT / "basemap-browser-report.json").write_text(
        json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n"
    )


atexit.register(save_report)


def check(name, condition=True):
    assert condition, name
    REPORT["checks"].append(name)
    print("PASS", name, flush=True)


def ready(page):
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    expect(page.locator(".maplibregl-canvas")).to_be_visible()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=CHROMIUM,
        args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    for failure in ["style", "partial-tiles"]:
        state = {"blocked": True, "failedTile": False, "tiles": 0, "oldHost": 0}
        context = browser.new_context(viewport={"width": 1440, "height": 1000})

        def asset(route, _request, state=state, failure=failure):
            path = route.request.url
            if state["blocked"] and (
                (failure == "style" and "/styles/" in path)
                or (failure == "partial-tiles" and "/fixtures/" in path and not state["failedTile"])
            ):
                state["failedTile"] = True
                return route.fulfill(status=403, body="Provider unavailable")
            if "/fixtures/" in path:
                state["tiles"] += 1
            return route.fulfill(**basemap_fixture(path))

        def old_host(route, _request, state=state):
            state["oldHost"] += 1
            route.abort()

        context.route(f"https://{BASEMAP_HOST}/**", asset)
        context.route("https://tile.openstreetmap.org/**", old_host)
        page = context.new_page()
        page.on("pageerror", lambda error: REPORT["pageErrors"].append(str(error)))
        page.goto(
            BASE_URL + "/#v=1&region=tokyo&c=139.7671,35.6812,12,0,0&theme=light",
            wait_until="domcontentloaded",
        )
        ready(page)
        expect(page.locator(".cluster-label").first).to_be_visible(timeout=20000)
        expect(page.locator(".map-network-note")).to_be_visible(timeout=20000)
        check(f"{failure}: provider 403 leaves toilet markers and list usable")
        if failure == "partial-tiles":
            page.wait_for_function("() => document.querySelectorAll('.cluster-label').length > 1")
            check("A successful tile does not hide a failure elsewhere", state["tiles"] > 0)
        page.locator(".card-main").first.click()
        expect(page.locator(".detail-panel")).to_be_visible()
        page.wait_for_timeout(1000)
        before = page.evaluate("JSON.parse(localStorage.getItem('view-state'))")
        page.get_by_role("button", name="關閉廁所詳細資訊", exact=True).click()
        state["blocked"] = False
        with page.expect_response(lambda response: "/fixtures/" in response.url and response.ok):
            page.locator(".map-network-note").get_by_role("button", name="重試", exact=True).click()
        expect(page.locator(".map-network-note")).to_have_count(0)
        expect(page.locator(".maplibregl-ctrl-attrib")).to_contain_text(
            "OpenMapTiles", timeout=20000
        )
        ready(page)
        after = page.evaluate("JSON.parse(localStorage.getItem('view-state'))")
        if after["camera"] != before["camera"] or after["lastViewed"] != before["selected"]:
            print(
                json.dumps(
                    {
                        "before": before["camera"],
                        "after": after["camera"],
                        "tiles": state["tiles"],
                        "lastViewed": after["lastViewed"],
                        "selected": before["selected"],
                    }
                ),
                flush=True,
            )
        check(
            f"{failure}: retry restores tiles and preserves the viewed toilet and camera",
            state["tiles"] > 0
            and after["lastViewed"] == before["selected"]
            and after["camera"] == before["camera"],
        )
        page.get_by_role("combobox", name="切換外觀", exact=True).select_option("dark")
        page.get_by_role("combobox", name="切換外觀", exact=True).select_option("light")
        ready(page)
        page.locator(".region-tabs button").nth(1).click()
        expect(page.locator(".footer-meta")).to_contain_text("5,952", timeout=20000)
        page.wait_for_timeout(1000)
        page.get_by_role("button", name="縮小地圖", exact=True).click()
        page.get_by_role("button", name="縮小地圖", exact=True).click()
        ready(page)
        check(
            f"{failure}: fast appearance switches leave map data responsive", not state["oldHost"]
        )
        context.close()

    if REAL_MAP:
        for name, region, coordinates, mobile, theme in [
            ("desktop-tokyo-light", "tokyo", "139.7671,35.6812,13,0,0", False, "light"),
            ("desktop-tokyo-dark", "tokyo", "139.7671,35.6812,13,0,0", False, "dark"),
            ("mobile-busan-dark", "busan", "129.0756,35.1796,12,0,0", True, "dark"),
        ]:
            context = browser.new_context(
                viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 1000},
                is_mobile=mobile,
                has_touch=mobile,
                service_workers="block",
            )
            context.route(f"https://{BASEMAP_HOST}/**", verified_basemap)
            page = context.new_page()
            page.on("pageerror", lambda error: REPORT["pageErrors"].append(str(error)))
            responses = []
            page.on(
                "response",
                lambda response, responses=responses: (
                    responses.append({"url": response.url, "status": response.status})
                    if BASEMAP_HOST in response.url
                    else None
                ),
            )
            page.goto(
                f"{BASE_URL}/#v=1&region={region}&c={coordinates}&theme={theme}",
                wait_until="networkidle",
                timeout=60000,
            )
            expect(page.locator(".map-network-note")).to_have_count(0)
            expect(page.locator(".maplibregl-ctrl-attrib")).to_contain_text("OpenMapTiles")
            page.screenshot(path=str(OUT / f"basemap-{name}.png"))
            check(
                f"{name}: real style, vector tiles, glyphs and sprites load with attribution",
                any("/planet/" in row["url"] for row in responses)
                and any("/fonts/" in row["url"] for row in responses)
                and any("/sprites/" in row["url"] for row in responses)
                and all(row["status"] == 200 for row in responses),
            )
            REPORT["externalResponses"].append({"viewport": name, "responses": responses})
            context.close()
    browser.close()
check("No unhandled errors during provider failures and map recovery", not REPORT["pageErrors"])
REPORT["passed"] = True
save_report()
