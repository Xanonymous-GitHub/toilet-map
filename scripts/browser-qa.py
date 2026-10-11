import atexit
import json
import os
import re
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("RELIEF_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
ROOT = Path(__file__).resolve().parent.parent
coverage = json.loads((ROOT / "docs/coverage.json").read_text())


def expected_count(region):
    return f"{coverage['cityCounts'][region]:,}"


out = Path(__file__).resolve().parent.parent / "test-results"
out.mkdir(exist_ok=True)
report = {
    "startedAt": datetime.now(UTC).isoformat(),
    "passed": False,
    "transport": (
        "External map/font assets fetched through the session proxy with CA-verified TLS; "
        "browser TLS remains enabled."
    ),
    "checks": [],
    "pageErrors": [],
    "consoleErrors": [],
    "tileResponses": 0,
    "mapWorkerResponses": 0,
    "apiRequests": [],
}


def save_report():
    (out / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))


atexit.register(save_report)


def check(name, condition=True):
    assert condition, name
    report["checks"].append(name)
    print("PASS", name, flush=True)


proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
proxy = None
if proxy_url:
    parsed = urlparse(proxy_url)
    proxy = {
        "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}",
        "bypass": "localhost,127.0.0.1",
    }
    if parsed.username:
        proxy.update(username=parsed.username, password=parsed.password or "")


def verified_asset(route):
    req = route.request
    host = urlparse(req.url).hostname
    if report.get("offlineBridge") and host in {
        "tile.openstreetmap.org",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
    }:
        return route.abort()
    if host not in {"tile.openstreetmap.org", "fonts.googleapis.com", "fonts.gstatic.com"}:
        return route.continue_()
    try:
        request = urllib.request.Request(
            req.url,
            headers={
                "User-Agent": req.headers.get("user-agent", "Relief test browser"),
                "Referer": req.headers.get("referer", f"{BASE_URL}/"),
                "Accept": req.headers.get("accept", "*/*"),
            },
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read()
            headers = {
                k: v
                for k, v in response.headers.items()
                if k.lower() not in {"content-length", "transfer-encoding", "connection"}
            }
            route.fulfill(status=response.status, headers=headers, body=body)
    except Exception:
        route.abort()


with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        proxy=proxy,
        args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        geolocation={"latitude": 37.5665, "longitude": 126.978, "accuracy": 20},
        permissions=["geolocation"],
    )
    context.route("https://**/*", verified_asset)
    context.add_init_script("""
        window.__watchStarts=0;window.__watchStops=0;
        const start=navigator.geolocation.watchPosition.bind(navigator.geolocation);
        const stop=navigator.geolocation.clearWatch.bind(navigator.geolocation);
        navigator.geolocation.watchPosition=(...args)=>{
            window.__watchStarts++;return start(...args);
        };
        navigator.geolocation.clearWatch=(...args)=>{window.__watchStops++;return stop(...args);};
    """)
    page = context.new_page()
    page.on(
        "request",
        lambda request: (
            report["apiRequests"].append(request.url) if "/api/v1/toilets?" in request.url else None
        ),
    )
    page.on("pageerror", lambda e: report["pageErrors"].append(str(e)))
    page.on(
        "console", lambda m: report["consoleErrors"].append(m.text) if m.type == "error" else None
    )
    page.on(
        "response",
        lambda r: (
            report.update(tileResponses=report["tileResponses"] + 1)
            if "tile.openstreetmap.org/" in r.url and r.ok
            else None
        ),
    )
    page.on(
        "response",
        lambda r: (
            report.update(mapWorkerResponses=report["mapWorkerResponses"] + 1)
            if "maplibre-gl-worker-" in r.url and r.ok
            else None
        ),
    )
    page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    expect(page.locator(".map-loading")).to_have_count(0, timeout=20000)
    check(
        "Tokyo data loaded and interactive map initialized",
        page.locator(".maplibregl-canvas").count() == 1,
    )
    page.get_by_role("button", name="縮小地圖", exact=True).click()
    page.get_by_role("button", name="縮小地圖", exact=True).click()
    expect(page.locator(".cluster-label").first).to_be_visible(timeout=20000)
    label = page.locator(".cluster-label").first
    label.click()
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=10000)
    check("Toilet clusters render through the packaged map worker and can be selected")
    page.screenshot(path=str(out / "desktop.png"))
    page.locator(".card-main").first.click()
    expect(page.get_by_role("dialog", name="廁所詳細資訊")).to_be_visible()
    check(
        "Tokyo detail shows hours, accessibility, fees and navigation",
        page.locator(".detail-facts").count() == 1
        and page.locator(".nav-buttons button").count() == 2,
    )
    page.evaluate(
        "window.__navigation=[];window.open=(url)=>{window.__navigation.push(url);return null;}"
    )
    page.get_by_role("button", name="Google Maps", exact=True).click()
    page.wait_for_timeout(500)
    nav = page.evaluate("window.__navigation.at(-1)")
    check(
        "Google navigation uses walking directions with destination",
        "travelmode=walking" in nav and "destination=" in nav,
    )
    page.get_by_role("button", name="切換收藏", exact=True).click()
    check(
        "Favorite saved on device",
        len(json.loads(page.evaluate("localStorage.getItem('saved')") or "[]")) > 0,
    )
    page.get_by_role("button", name="關閉廁所詳細資訊").click()
    page.get_by_role("button", name="定位目前位置", exact=True).click()
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("seoul"), timeout=20000)
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    check("Granted GPS moves to Seoul and loads the complete city dataset")
    page.wait_for_function("window.__watchStarts > 0")
    page.get_by_role("button", name="放大地圖", exact=True).click()
    page.wait_for_function("window.__watchStops > 0")
    check("Manual map zoom stops GPS following and clears its watcher")
    with page.expect_response(lambda response: "/api/v1/toilets?region=seoul" in response.url):
        page.get_by_role("button", name="重新取得資料", exact=True).click()
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    check("Refresh control starts a new city-data request")
    page.get_by_role("button", name="現在開放", exact=True).click()
    check(
        "Open filter applies to known schedules",
        page.locator(".toilet-card .status.unknown").count() == 0
        and page.locator(".toilet-card .status.closed").count() == 0,
    )
    page.get_by_role("button", name="現在開放", exact=True).click()
    page.locator(".card-main").first.click()
    check(
        "Korea detail offers four map providers", page.locator(".nav-buttons button").count() == 4
    )
    page.get_by_role("button", name="Kakao 網頁", exact=True).click()
    page.wait_for_timeout(500)
    nav = page.evaluate("window.__navigation.at(-1)")
    check("Kakao directions include walking mode and current origin", "link/by/walk/" in nav)
    page.screenshot(path=str(out / "desktop-detail.png"))
    page.get_by_role("button", name="關閉廁所詳細資訊").click()
    page.get_by_role("button", name="資料來源與使用說明").click()
    expect(page.get_by_role("heading", name="每一點，都有出處。")).to_be_visible()
    check("Source attribution and caveats are visible", page.locator(".source-row").count() == 6)
    page.keyboard.press("Shift+Tab")
    check(
        "Native modal prevents background controls from receiving keyboard focus",
        page.evaluate("""(() => {
            const dialog=document.querySelector('.modal');
            const background=document.querySelector('.source-button');
            background.focus();
            return dialog.matches(':modal') && document.activeElement !== background;
        })()"""),
    )
    page.get_by_role("button", name="關閉說明").click()
    page.get_by_role("textbox", name="搜尋城市、車站或廁所").fill("明洞")
    page.locator(".search-results button").first.click()
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=10000)
    check("Place search changes the viewport and updates nearby list")
    page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=20000)
    check("Service worker controls the app")
    page.wait_for_timeout(1000)
    cached_count = re.search(r"[\d,]+", page.locator(".footer-meta").inner_text()).group()
    report["offlineBridge"] = True
    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".offline-banner")).to_be_visible(timeout=20000)
    expect(page.locator(".footer-meta")).to_contain_text(cached_count)
    check("Offline reload restores cached shell and the last downloaded scope without data loss")
    context.set_offline(False)
    report["offlineBridge"] = False
    for country, city in [
        ("日本", "sagamihara"),
        ("日本", "kurashiki"),
        ("日本", "osaka"),
        ("日本", "sapporo"),
        ("韓國", "gimpo"),
        ("韓國", "busan"),
        ("韓國", "jeju"),
    ]:
        page.get_by_role("button", name=country, exact=True).click()
        page.get_by_role("combobox", name="選擇城市").select_option(city)
        expect(page.locator(".footer-meta")).to_contain_text(expected_count(city), timeout=20000)
        expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
        check(f"Non-capital city {city} loads real toilets through the city picker")
        if city in {"osaka", "busan"}:
            page.screenshot(path=str(out / f"desktop-{city}.png"))
    context.set_geolocation({"latitude": 35.18, "longitude": 129.075, "accuracy": 20})
    page.get_by_role("button", name="定位目前位置", exact=True).click()
    expect(page.get_by_role("combobox", name="選擇城市")).to_have_value("busan")
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("busan"), timeout=20000)
    check("GPS in Busan selects Busan instead of the capital")
    page.get_by_role("button", name="日本", exact=True).click()
    expect(page.get_by_role("combobox", name="選擇城市")).to_have_value("sapporo")
    check("Switching countries remembers the last selected city")
    page.get_by_role("combobox", name="選擇城市").select_option("osaka")
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("osaka"), timeout=20000)
    page.get_by_role("button", name="縮小地圖", exact=True).click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="縮小地圖", exact=True).click()
    page.wait_for_timeout(400)
    canvas = page.locator(".maplibregl-canvas").bounding_box()
    with page.expect_response(lambda response: "/api/v1/toilets?region=osaka" in response.url):
        page.mouse.move(canvas["x"] + canvas["width"] - 80, canvas["y"] + canvas["height"] / 2)
        page.mouse.down()
        page.mouse.move(canvas["x"] + 80, canvas["y"] + canvas["height"] / 2, steps=12)
        page.mouse.up()
    check("Panning beyond a city's initial area requests another country-wide bbox")
    context.close()
    mobile = browser.new_context(
        viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True
    )
    mobile.route("https://**/*", verified_asset)
    mobile.add_init_script("localStorage.setItem('saved', '{}')")
    page = mobile.new_page()
    page.on("pageerror", lambda e: report["pageErrors"].append(str(e)))
    page.goto(f"{BASE_URL}?region=seoul", wait_until="networkidle", timeout=45000)
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    check(
        "Mobile has no horizontal document overflow",
        page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
    )
    page.screenshot(path=str(out / "mobile.png"))
    page.get_by_role("button", name="定位目前位置", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("定位權限未開啟", timeout=15000)
    check("Denied GPS gives a useful message and keeps the map usable")
    check(
        "Malformed saved preferences recover without blocking the app",
        page.evaluate("Array.isArray(JSON.parse(localStorage.getItem('saved')))"),
    )
    page.locator(".card-main").first.click()
    expect(page.locator(".detail-panel")).to_be_visible()
    page.locator(".detail-panel").evaluate("(e)=>e.scrollTop=e.scrollHeight")
    expect(page.get_by_role("button", name="Kakao 網頁", exact=True)).to_be_visible()
    page.screenshot(path=str(out / "mobile-detail.png"))
    check("Mobile detail sheet scrolls to navigation controls")
    page.get_by_role("button", name="關閉廁所詳細資訊").click()
    page.get_by_role("button", name="加入主畫面", exact=True).click()
    expect(page.get_by_role("heading", name="把方便，帶在身邊。")).to_be_visible()
    check("PWA installation guidance is available")
    page.get_by_role("button", name="關閉說明").click()
    page.evaluate("navigator.geolocation.getCurrentPosition=(resolve)=>{window.__lateGPS=resolve}")
    page.get_by_role("button", name="定位目前位置", exact=True).click()
    page.locator(".region-tabs button").first.click()
    page.evaluate("window.__lateGPS({coords:{latitude:37.5665,longitude:126.978,accuracy:20}})")
    expect(page.locator(".region-tabs button").first).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("tokyo"), timeout=20000)
    check("A late location result cannot undo the user's city selection")
    mobile.close()
    browser.close()
check("No unhandled browser errors", not report["pageErrors"])
check(
    "Map workers load without errors, including offline reload",
    report["mapWorkerResponses"] > 0
    and not any("Worker failed to load" in error for error in report["consoleErrors"]),
)
report["passed"] = True
(out / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
