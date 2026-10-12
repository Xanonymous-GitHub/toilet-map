import atexit
import json
import os
import re
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

from map_assets import BASEMAP_HOST, basemap_fixture
from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("RELIEF_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
ROOT = Path(__file__).resolve().parent.parent
FIXTURE_ASSETS = os.environ.get("RELIEF_QA_FIXTURE_ASSETS") == "1"
proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
CHROMIUM_PATH = os.environ.get("RELIEF_CHROMIUM_PATH")
if not CHROMIUM_PATH and Path("/usr/bin/chromium").exists():
    CHROMIUM_PATH = "/usr/bin/chromium"
coverage = json.loads((ROOT / "docs/coverage.json").read_text())


def expected_count(region):
    return f"{coverage['cityCounts'][region]:,}"


def wait_for_viewport(page, region):
    # City data arrives before flyTo finishes; onBounds narrows this count only
    # once the selected city's flight reaches its destination.
    page.wait_for_function(
        "total => { const count = Number(document.querySelector('.list-heading .count')"
        ".textContent); return count > 0 && count < total; }",
        arg=coverage["cityCounts"][region],
    )


out = Path(__file__).resolve().parent.parent / "test-results"
out.mkdir(exist_ok=True)
report = {
    "startedAt": datetime.now(UTC).isoformat(),
    "passed": False,
    "transport": (
        "CI uses a committed raster tile. Toilet data, API, "
        "map worker and PWA assets come from the actual local production build."
        if FIXTURE_ASSETS
        else (
            "External map/font assets fetched through the session proxy with CA-verified TLS; "
            "browser TLS remains enabled."
            if proxy_url
            else "Public map/font assets loaded directly by the browser with TLS verification."
        )
    ),
    "checks": [],
    "pageErrors": [],
    "consoleErrors": [],
    "consoleWarnings": [],
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


def record_console(message):
    if message.type == "error":
        report["consoleErrors"].append(message.text)
    elif message.type == "warning":
        report["consoleWarnings"].append(message.text)


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
    if report.get("offlineBridge") and host == BASEMAP_HOST:
        return route.abort()
    if host != BASEMAP_HOST:
        return route.continue_()
    if not FIXTURE_ASSETS and not proxy_url:
        return route.continue_()
    if FIXTURE_ASSETS:
        return route.fulfill(**basemap_fixture(req.url))
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
        executable_path=CHROMIUM_PATH,
        headless=True,
        proxy=proxy,
        args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        geolocation={"latitude": 37.5665, "longitude": 126.978, "accuracy": 20},
        permissions=["geolocation"],
    )
    if FIXTURE_ASSETS or proxy:
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
    page.on("console", record_console)
    page.on(
        "response",
        lambda r: (
            report.update(tileResponses=report["tileResponses"] + 1)
            if BASEMAP_HOST in r.url and r.url.endswith(".png") and r.ok
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
    check("Permanent map slogan has been removed", page.locator(".map-note").count() == 0)
    expect(page.locator(".map-install")).to_have_count(0, timeout=12000)
    check("Installation promotion hides automatically")
    page.get_by_role("button", name="收起側邊欄", exact=True).click()
    expect(page.locator(".sidebar")).to_have_count(0)
    page.wait_for_function(
        "() => document.querySelector('.maplibregl-canvas').getBoundingClientRect().width === 1440"
    )
    check(
        "Collapsing the sidebar gives its space to a resized map",
        page.locator(".map-panel").bounding_box()["width"] == 1440
        and page.locator(".maplibregl-canvas").bounding_box()["width"] == 1440,
    )
    page.get_by_role("button", name="展開側邊欄", exact=True).click()
    expect(page.locator(".sidebar")).to_be_visible()
    page.get_by_role("combobox", name="切換外觀", exact=True).select_option("dark")
    page.wait_for_function("() => document.documentElement.classList.contains('dark')")
    check(
        "Dark mode is persisted and applied to the whole app",
        page.evaluate("localStorage.getItem('theme') === JSON.stringify('dark')"),
    )
    page.screenshot(path=str(out / "desktop-dark.png"))
    page.reload(wait_until="networkidle")
    check(
        "Saved dark preference survives reload",
        page.evaluate("document.documentElement.classList.contains('dark')"),
    )
    page.get_by_role("combobox", name="切換外觀", exact=True).select_option("light")
    page.get_by_role("combobox", name="切換外觀", exact=True).select_option("system")
    page.emulate_media(color_scheme="dark")
    page.wait_for_function("() => document.documentElement.classList.contains('dark')")
    page.emulate_media(color_scheme="light")
    page.wait_for_function("() => !document.documentElement.classList.contains('dark')")
    check("System appearance updates without a reload")
    expect(page.locator(".map-loading")).to_have_count(0, timeout=20000)
    check(
        "Desktop map controls sit at the bottom",
        page.evaluate("""(() => {
        const panel=document.querySelector('.map-panel').getBoundingClientRect();
        const controls=document.querySelector('.map-controls').getBoundingClientRect();
        return panel.bottom-controls.bottom < 60 && controls.top > panel.top+panel.height/2;
    })()"""),
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
    page.wait_for_function("() => window.__watchStarts > 0")
    wait_for_viewport(page, "seoul")
    page.get_by_role("button", name="放大地圖", exact=True).click()
    page.wait_for_function("() => window.__watchStops > 0")
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
    expect(page.get_by_role("dialog", name="每一點，都有出處。", exact=True)).to_be_visible()
    check("Source dialog has an accessible name")
    check("Source attribution and caveats are visible", page.locator(".source-row").count() == 6)
    page.keyboard.press("Shift+Tab")
    check(
        "shadcn dialog traps focus and prevents background keyboard access",
        page.evaluate("""(() => {
            const dialog=document.querySelector('.modal');
            const background=document.querySelector('.source-button');
            background.focus();
            return dialog.getAttribute('aria-modal') === 'true'
                && document.activeElement !== background;
        })()"""),
    )
    page.get_by_role("button", name="關閉說明").click()
    page.get_by_role("searchbox", name="搜尋城市、車站或廁所").fill("明洞")
    page.locator(".search-results button").first.click()
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=10000)
    check("Place search changes the viewport and updates nearby list")
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=20000)
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
        page.get_by_role(
            "button", name=f"{country} {'JAPAN' if country == '日本' else 'KOREA'}", exact=True
        ).click()
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
    page.get_by_role("button", name="日本 JAPAN", exact=True).click()
    expect(page.get_by_role("combobox", name="選擇城市")).to_have_value("sapporo")
    check("Switching countries remembers the last selected city")
    page.get_by_role("combobox", name="選擇城市").select_option("osaka")
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("osaka"), timeout=20000)
    wait_for_viewport(page, "osaka")
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
        viewport={"width": 390, "height": 844},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
    )
    if FIXTURE_ASSETS or proxy:
        mobile.route("https://**/*", verified_asset)
    mobile.add_init_script("localStorage.setItem('saved', '{}')")
    page = mobile.new_page()
    page.on("pageerror", lambda e: report["pageErrors"].append(str(e)))
    page.on("console", record_console)
    page.goto(f"{BASE_URL}?region=seoul", wait_until="networkidle", timeout=45000)
    expect(page.locator(".map-loading")).to_have_count(0, timeout=20000)
    expect(page.locator(".mobile-results-trigger")).not_to_contain_text("…", timeout=20000)
    check(
        "Mobile starts with a full map and keeps secondary controls off the main screen",
        page.locator(".map-panel").bounding_box()["height"] == 844
        and page.locator(".sidebar, .sidebar-footer, .region-tabs, .toilet-list").count() == 0
        and not page.locator(".map-legend").is_visible(),
    )
    check(
        "High-density phones keep the map canvas at 2x while UI text retains device resolution",
        page.locator(".maplibregl-canvas").evaluate(
            "e => devicePixelRatio === 3 && e.width === e.clientWidth * 2"
            " && e.height === e.clientHeight * 2"
        ),
    )
    page.screenshot(path=str(out / "mobile.png"))
    page.get_by_role("button", name="地點與篩選", exact=True).click()
    expect(page.get_by_role("dialog", name="地點與篩選")).to_be_visible()
    page.get_by_role("combobox", name="切換外觀", exact=True).select_option("dark")
    page.get_by_role("button", name="返回地圖", exact=True).click()
    page.wait_for_timeout(250)
    page.screenshot(path=str(out / "mobile-dark.png"))
    check(
        "Mobile settings close cleanly and return keyboard focus to the trigger",
        page.locator(".mobile-panel").count() == 0
        and page.get_by_role("button", name="地點與篩選", exact=True).evaluate(
            "e => e === document.activeElement"
        ),
    )
    # Check usable space and hit targets, rather than only document overflow.
    for width, height in [(320, 568), (375, 667), (430, 932), (393, 480), (844, 390)]:
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(250)
        check(
            f"Mobile {width}x{height} preserves map space and reachable non-overlapping controls",
            page.evaluate("""() => {
                const map = document.querySelector('.map-panel').getBoundingClientRect();
                const header = document.querySelector('.mobile-map-header').getBoundingClientRect();
                const list = document.querySelector('.mobile-results-trigger')
                    .getBoundingClientRect();
                const gps = document.querySelector('.locate-control').getBoundingClientRect();
                const controls = ['.mobile-settings-trigger',
                    '.mobile-results-trigger', '.locate-control'];
                return document.documentElement.scrollWidth <= innerWidth
                    && document.documentElement.scrollHeight <= innerHeight
                    && map.width === innerWidth && map.height === innerHeight
                    && list.left >= 0 && gps.right <= innerWidth
                    && list.right < gps.left && list.bottom <= innerHeight
                    && header.height <= 64 && list.top - header.bottom >= innerHeight * 0.6
                    && controls.every(selector => {
                        const element = document.querySelector(selector);
                        const rect = element.getBoundingClientRect();
                        return rect.width >= 44 && rect.height >= 44
                            && element.contains(document.elementFromPoint(
                                rect.x + rect.width / 2, rect.y + rect.height / 2));
                    });
            }"""),
        )
        page.locator(".mobile-results-trigger").click()
        expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
        expect(page.locator(".mobile-panel")).to_be_in_viewport(ratio=1)
        check(
            f"Mobile {width}x{height} list heading leaves the first facility card unobscured",
            page.evaluate("""() => {
                const heading = document.querySelector('.list-heading').getBoundingClientRect();
                const first = document.querySelector('.toilet-card').getBoundingClientRect();
                const panel = document.querySelector('.mobile-panel').getBoundingClientRect();
                const list = document.querySelector('.toilet-list').getBoundingClientRect();
                return first.top >= heading.bottom && first.top >= list.top
                    && first.bottom <= panel.bottom && panel.width <= innerWidth
                    && panel.top >= 0 && panel.bottom <= innerHeight;
            }"""),
        )
        page.screenshot(path=str(out / f"mobile-list-{width}x{height}.png"))
        page.get_by_role("button", name="返回地圖", exact=True).click()
        page.get_by_role("button", name="地點與篩選", exact=True).click()
        page.locator(".mobile-settings-body").evaluate("e => e.scrollTop=e.scrollHeight")
        expect(page.get_by_role("button", name="加入主畫面", exact=True)).to_be_in_viewport()
        check(f"Mobile {width}x{height} secondary actions remain reachable by scrolling")
        page.get_by_role("button", name="返回地圖", exact=True).click()
    page.set_viewport_size({"width": 390, "height": 844})
    page.get_by_role("button", name="地點與篩選", exact=True).click()
    page.get_by_role("button", name="無障礙", exact=True).click()
    expect(page.get_by_role("button", name="無障礙", exact=True)).to_have_attribute(
        "aria-pressed", "true"
    )
    page.get_by_role("button", name="查看地圖 · 1 項篩選", exact=True).click()
    expect(page.locator(".filter-count")).to_have_text("1")
    check("Mobile shows the active filter count without leaving the filter controls open")
    page.get_by_role("button", name="地點與篩選，已套用 1 項", exact=True).click()
    page.get_by_role("button", name="無障礙", exact=True).click()
    page.get_by_role("combobox", name="選擇城市", exact=True).select_option("busan")
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("busan"), timeout=20000)
    page.screenshot(path=str(out / "mobile-settings.png"))
    page.keyboard.press("Escape")
    expect(page.locator(".mobile-panel")).to_have_count(0)
    expect(page.locator(".mobile-results-trigger")).to_contain_text("釜山")
    check("Mobile can select a non-capital city and dismiss settings with Escape")
    page.get_by_role("searchbox", name="搜尋城市、車站或廁所").click()
    page.get_by_role("searchbox", name="搜尋城市、車站或廁所").fill("明洞")
    page.locator(".search-results button").first.click()
    expect(page.locator(".mobile-results-trigger")).to_contain_text("首爾")
    expect(page.locator(".search-results")).to_have_count(0)
    check("Mobile place search changes the city and returns to the full map")
    page.get_by_role("searchbox", name="搜尋城市、車站或廁所").fill("不存在的廁所名稱")
    page.get_by_role("searchbox", name="搜尋城市、車站或廁所").press("Enter")
    expect(page.get_by_role("dialog", name="附近廁所", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="這個區域沒有符合的資料")).to_be_visible()
    check("Mobile search submit opens a usable empty-results panel")
    page.get_by_role("button", name="返回地圖", exact=True).click()
    page.get_by_role("button", name="清除搜尋", exact=True).click()
    page.get_by_role("button", name="關閉搜尋建議", exact=True).click()
    page.get_by_role("button", name="定位目前位置", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("定位權限未開啟", timeout=15000)
    check("Denied GPS gives a useful message and keeps the map usable")
    page.get_by_role("button", name="關閉訊息", exact=True).click()
    check(
        "Malformed saved preferences recover without blocking the app",
        page.evaluate("Array.isArray(JSON.parse(localStorage.getItem('saved')))"),
    )
    page.locator(".mobile-results-trigger").click()
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    page.locator(".card-main").first.click()
    expect(page.locator(".detail-panel")).to_be_visible()
    expect(page.locator(".mobile-panel")).to_have_count(0)
    page.locator(".detail-panel").evaluate("(e)=>e.scrollTop=e.scrollHeight")
    expect(page.get_by_role("button", name="Kakao 網頁", exact=True)).to_be_visible()
    page.screenshot(path=str(out / "mobile-detail.png"))
    check("Mobile results close before details open, and navigation remains reachable")
    page.get_by_role("button", name="關閉廁所詳細資訊").click()
    expect(page.locator(".mobile-results-trigger")).to_be_focused()
    check("Mobile detail dismissal restores focus to the nearby list entry")
    page.get_by_role("button", name="地點與篩選", exact=True).click()
    page.get_by_role("button", name="資料來源與使用說明", exact=True).click()
    expect(page.get_by_role("dialog", name="每一點，都有出處。")).to_be_visible()
    expect(page.locator(".mobile-panel")).to_have_count(0)
    check("Mobile source information opens without stacked settings overlays")
    page.get_by_role("button", name="關閉說明").click()
    page.get_by_role("button", name="地點與篩選", exact=True).click()
    page.get_by_role("button", name="加入主畫面", exact=True).click()
    expect(page.get_by_role("heading", name="把方便，帶在身邊。")).to_be_visible()
    expect(page.locator(".mobile-panel")).to_have_count(0)
    check("PWA installation guidance is available on demand without stacked overlays")
    page.get_by_role("button", name="關閉說明").click()
    expect(page.locator(".mobile-settings-trigger")).to_be_focused()
    check("Mobile information dismissal restores focus to settings")
    page.evaluate("navigator.geolocation.getCurrentPosition=(resolve)=>{window.__lateGPS=resolve}")
    page.get_by_role("button", name="定位目前位置", exact=True).click()
    page.get_by_role("button", name="地點與篩選", exact=True).click()
    page.locator(".region-tabs button").first.click()
    page.evaluate("window.__lateGPS({coords:{latitude:37.5665,longitude:126.978,accuracy:20}})")
    expect(page.locator(".region-tabs button").first).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".footer-meta")).to_contain_text(expected_count("tokyo"), timeout=20000)
    check("A late location result cannot undo the user's city selection")
    page.get_by_role("button", name="返回地圖", exact=True).click()
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=20000)
    report["offlineBridge"] = True
    mobile.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".offline-banner")).to_be_visible(timeout=20000)
    page.locator(".mobile-results-trigger").click()
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    check("Mobile offline reload still opens the cached nearby toilet list")
    report["offlineBridge"] = False
    mobile.close()
    unavailable_map = browser.new_context()
    if FIXTURE_ASSETS or proxy:
        unavailable_map.route("https://**/*", verified_asset)
    unavailable_map.route("**/assets/maplibre-*.js", lambda route: route.abort())
    page = unavailable_map.new_page()
    page.on("pageerror", lambda e: report["pageErrors"].append(str(e)))
    page.on("console", record_console)
    page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
    expect(page.locator(".map-fallback")).to_be_visible(timeout=20000)
    expect(page.locator(".toilet-card").first).to_be_visible(timeout=20000)
    page.locator(".card-main").first.click()
    expect(page.get_by_role("dialog", name="廁所詳細資訊")).to_be_visible()
    check("A failed lazy map download keeps the toilet list and details usable")
    unavailable_map.close()
    browser.close()
check("No unhandled browser errors", not report["pageErrors"])
# Chromium's software WebGL driver warns when screenshots read back pixels.
# Retain these diagnostics in the report; reject every other console warning.
check(
    "No application console warnings",
    all(
        re.fullmatch(
            r"\[\.WebGL-0x[0-9a-f]+\]GL Driver Message "
            r"\(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels"
            r"(?: \(this message will no longer repeat\))?",
            warning,
        )
        for warning in report["consoleWarnings"]
    ),
)
check(
    "Map workers load without errors, including offline reload",
    report["mapWorkerResponses"] > 0
    and not any("Worker failed to load" in error for error in report["consoleErrors"]),
)
report["passed"] = True
(out / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
