"""Verify saved browser views and share URLs against the production application."""

import atexit
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = os.environ.get("RELIEF_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
CHROMIUM_PATH = os.environ.get("RELIEF_CHROMIUM_PATH")
if not CHROMIUM_PATH and Path("/usr/bin/chromium").exists():
    CHROMIUM_PATH = "/usr/bin/chromium"
REPORT = {
    "startedAt": datetime.now(UTC).isoformat(),
    "passed": False,
    "transport": "Fixed map tiles; actual production API, state, UI, worker and PWA assets.",
    "checks": [],
    "pageErrors": [],
}


def save_report():
    (OUT / "state-browser-report.json").write_text(
        json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n"
    )


atexit.register(save_report)


def check(name, condition=True):
    assert condition, name
    REPORT["checks"].append(name)
    print("PASS", name, flush=True)


def snapshot(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('view-state'))")


def context_for(browser, mobile=False, seed=None):
    context = browser.new_context(
        viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 1000},
        is_mobile=mobile,
        has_touch=mobile,
    )
    context.route(
        "https://tile.openstreetmap.org/**",
        lambda route: route.fulfill(
            status=200,
            content_type="image/png",
            body=(ROOT / "tests/fixtures/basemap.png").read_bytes(),
        ),
    )
    if seed:
        context.add_init_script(
            """const seed = """
            + json.dumps(seed)
            + """;
            if (!localStorage.getItem('state-qa-seeded')) {
                for (const [key,value] of Object.entries(seed))
                    localStorage.setItem(key, JSON.stringify(value));
                localStorage.setItem('state-qa-seeded','1');
            }"""
        )
    return context


def page_for(context):
    page = context.new_page()
    page.on("pageerror", lambda error: REPORT["pageErrors"].append(str(error)))
    return page


def ready(page):
    expect(page.locator(".map-loading")).to_have_count(0, timeout=20000)
    page.wait_for_function("() => localStorage.getItem('view-state') !== null")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=CHROMIUM_PATH,
        headless=True,
        args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    sender = context_for(browser)
    sender.add_init_script("""
        window.__legacyReady = false;
        const request = indexedDB.open('relief-pwa',1);
        request.onupgradeneeded = () => request.result.createObjectStore('regions');
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            const transaction = db.transaction('regions','readwrite');
            transaction.objectStore('regions').put({retained:true},'legacy-marker');
            transaction.oncomplete = () => {db.close();window.__legacyReady = true;};
        };
        request.onerror = () => {window.__legacyReady = true;};
        window.__shared = [];
        Object.defineProperty(navigator,'share', {configurable:true,
            value:async value => {window.__shared.push(value);}});
    """)
    page = page_for(sender)
    page.goto(f"{BASE_URL}?region=busan", wait_until="networkidle")
    ready(page)
    expect(page.locator(".toilet-card").first).to_be_visible()
    page.locator(".card-main").first.click()
    expect(page.locator(".detail-panel")).to_be_visible()
    selected = snapshot(page)["selected"]
    name = page.locator(".detail-panel h2").text_content()
    page.get_by_role("button", name="切換收藏", exact=True).click()
    page.get_by_role("combobox", name="切換外觀", exact=True).select_option("dark")
    for label in ["現在開放", "無障礙", "免費"]:
        page.get_by_role("button", name=label, exact=True).click()
    page.get_by_role("button", name="更多篩選條件", exact=True).click()
    page.get_by_label("現在開放時，包含時間未知").check()
    page.get_by_role("searchbox", name="搜尋城市、車站或廁所").fill("釜山 & 서울 + 便所")
    page.get_by_role("button", name="關閉搜尋建議", exact=True).click()
    page.get_by_role("button", name="回到上次查看的廁所", exact=True).click()
    expect(page.locator(".detail-panel")).to_be_visible()
    page.wait_for_timeout(1000)
    page.get_by_role("button", name="分享目前畫面", exact=True).click()
    shared = page.evaluate("() => window.__shared.at(-1).url")
    expected = snapshot(page)
    if shared != page.url or expected["selected"] != selected:
        print(
            json.dumps(
                {
                    "shared": shared,
                    "url": page.url,
                    "selected": selected,
                    "current": expected["selected"],
                }
            ),
            flush=True,
        )
        page.screenshot(path=str(OUT / "state-share-debug.png"))
    check(
        "Native sharing captures the selected toilet and the complete current URL",
        shared == page.url and expected["selected"] == selected,
    )
    check(
        "Sharing leaves personal bookmarks out when the saved filter is off",
        "saved=" not in shared and expected["lastViewed"] == selected,
    )
    page.evaluate("""Object.defineProperty(navigator,'share',{configurable:true,
        value:async () => {throw new DOMException('Cancelled','AbortError');}})""")
    page.get_by_role("button", name="分享目前畫面", exact=True).click()
    expect(page.locator(".share-dialog")).to_have_count(0)
    check(
        "Cancelling the native share sheet leaves the underlying view unchanged",
        page.url == shared and snapshot(page) == expected,
    )
    page.get_by_role("button", name="資料來源與使用說明", exact=True).click()
    expect(page.get_by_role("dialog", name="每一點，都有出處。")).to_be_visible()
    page.locator(".modal").evaluate("e => e.scrollTop=e.scrollHeight")
    page.wait_for_timeout(300)
    source_url = page.url
    source_offset = snapshot(page)["modalScroll"]
    check("Source information has a distinct shareable URL", "panel=sources" in source_url)
    page.go_back()
    expect(page.locator(".detail-panel")).to_be_visible(timeout=10000)
    check(
        "Back restores the previous toilet detail and its filters",
        snapshot(page)["selected"] == selected and snapshot(page)["filters"] == expected["filters"],
    )
    page.go_forward()
    expect(page.get_by_role("dialog", name="每一點，都有出處。")).to_be_visible()
    check("Forward restores the source information dialog")
    page.get_by_role("button", name="關閉說明", exact=True).click()
    page.get_by_role("button", name="回到上次查看的廁所", exact=True).click()
    expect(page.locator(".detail-panel h2")).to_have_text(name)
    check("The last successfully viewed toilet remains available after its detail closes")
    page.reload(wait_until="networkidle")
    ready(page)
    expect(page.locator(".detail-panel h2")).to_have_text(name)
    expect(page.get_by_role("searchbox", name="搜尋城市、車站或廁所")).to_have_value(
        expected["query"]
    )
    check(
        "Reload restores toilet details, Unicode search, filters, theme and camera",
        all(
            snapshot(page)[key] == expected[key]
            for key in ["region", "selected", "filters", "theme", "camera"]
        ),
    )
    page.goto(BASE_URL, wait_until="networkidle")
    ready(page)
    expect(page.locator(".detail-panel h2")).to_have_text(name)
    check("Opening the base URL restores the browser's last view without URL parameters")
    cached = page.evaluate("""() => new Promise((resolve,reject) => {
        const request=indexedDB.open('relief-pwa');
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
            const db=request.result;
            const tx=db.transaction(['regions','toilets']);
            const legacy=tx.objectStore('regions').get('legacy-marker');
            const toilet=tx.objectStore('toilets').get(
                JSON.parse(localStorage.getItem('view-state')).selected);
            tx.oncomplete=()=>{resolve({version:db.version,legacy:legacy.result,
                toilet:toilet.result});db.close();};
        };
    })""")
    check(
        "IndexedDB upgrades from v1 without deleting cached regions and stores viewed toilets",
        cached["version"] == 2
        and cached["legacy"]["retained"]
        and cached["toilet"]["id"] == selected,
    )
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=20000)
    sender.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".detail-panel h2")).to_have_text(name, timeout=20000)
    check("Offline reopening restores the last selected toilet from browser storage")
    sender.set_offline(False)
    stale = {
        **expected,
        "region": "tokyo",
        "selected": None,
        "theme": "light",
        "query": "old query",
        "sidebarOpen": False,
        "filters": {key: False for key in expected["filters"]},
    }
    receiver = context_for(
        browser, seed={"view-state": stale, "theme": "light", "saved": ["osm-node-personal"]}
    )
    receiver.add_init_script("""window.__gpsRequests=0;
        navigator.geolocation.getCurrentPosition=()=>{window.__gpsRequests++;};
        navigator.geolocation.watchPosition=()=>{window.__gpsRequests++;return 1;};""")
    incoming = page_for(receiver)
    incoming.goto(shared, wait_until="networkidle")
    ready(incoming)
    expect(incoming.locator(".detail-panel h2")).to_have_text(name)
    expect(incoming.get_by_role("combobox", name="選擇城市")).to_have_value("busan")
    expect(incoming.get_by_role("searchbox", name="搜尋城市、車站或廁所")).to_have_value(
        expected["query"]
    )
    check(
        "A shared link overrides the recipient's conflicting saved view and theme",
        all(
            snapshot(incoming)[key] == expected[key]
            for key in [
                "region",
                "selected",
                "filters",
                "theme",
                "camera",
                "sidebarOpen",
                "moreFilters",
            ]
        ),
    )
    check(
        "Shared links do not overwrite the recipient's personal bookmarks or request GPS",
        incoming.evaluate("() => JSON.parse(localStorage.getItem('saved'))")
        == ["osm-node-personal"]
        and incoming.evaluate("() => window.__gpsRequests") == 0,
    )
    incoming.goto(source_url, wait_until="networkidle")
    expect(incoming.get_by_role("dialog", name="每一點，都有出處。")).to_be_visible()
    check("A source-dialog URL opens the same dialog in a fresh recipient context")
    incoming.wait_for_function(
        "offset => Math.abs(document.querySelector('.modal').scrollTop - offset) < 1",
        arg=source_offset,
    )
    check("Source links restore the document's scroll position", source_offset > 0)
    incoming.get_by_role("button", name="關閉說明", exact=True).click()
    incoming.get_by_role("button", name="展開側邊欄", exact=True).click() if not snapshot(incoming)[
        "sidebarOpen"
    ] else None
    # Build a saved-only collection and verify that recipients can view it independently.
    page.goto(f"{BASE_URL}?region=busan", wait_until="networkidle")
    ready(page)
    page.get_by_role("button", name="更多篩選條件", exact=True).click()
    page.get_by_label("只看已收藏").check()
    expect(page.locator(".toilet-card")).to_have_count(1)
    saved_url = page.url
    incoming.goto(saved_url, wait_until="networkidle")
    ready(incoming)
    expect(incoming.locator(".toilet-card")).to_have_count(1)
    expect(incoming.locator(".list-heading")).to_contain_text("分享的收藏")
    check(
        "Saved-only links reproduce the sender's collection without importing bookmarks",
        snapshot(incoming)["sharedSaved"] == [selected]
        and incoming.evaluate("() => JSON.parse(localStorage.getItem('saved'))")
        == ["osm-node-personal"],
    )
    # A legacy ID-only URL must resolve a toilet that is not in the default city's scope.
    incoming.goto(f"{BASE_URL}?toilet={selected}", wait_until="networkidle")
    expect(incoming.locator(".detail-panel h2")).to_have_text(name, timeout=20000)
    expect(incoming.get_by_role("combobox", name="選擇城市")).to_have_value("busan")
    check(
        "ID-only deep links resolve non-capital toilets and infer their city",
        snapshot(incoming)["camera"]["zoom"] == 16,
    )
    incoming.goto(f"{BASE_URL}/#v=1&region=busan&toilet=osm-node-missing", wait_until="networkidle")
    expect(incoming.locator(".selection-note")).to_contain_text("已不在資料中")
    incoming.get_by_role("button", name="關閉廁所資訊", exact=True).click()
    expect(incoming.locator(".selection-note")).to_have_count(0)
    check("Missing toilet links show a useful recovery path without breaking the map")
    # Exercise mobile panels, scroll positions, share fallbacks and orientation.
    mobile = context_for(browser, mobile=True)
    phone = page_for(mobile)
    phone.goto(f"{BASE_URL}?region=seoul", wait_until="networkidle")
    ready(phone)
    phone.locator(".mobile-results-trigger").click()
    expect(phone.locator(".toilet-card").first).to_be_visible()
    phone.get_by_role("button", name="顯示更多", exact=False).click()
    phone.locator(".toilet-list").evaluate("e => e.scrollTop=380")
    phone.wait_for_timeout(300)
    list_url = phone.url
    check(
        "Mobile list URLs include the expanded count and settled scroll position",
        snapshot(phone)["mobilePanel"] == "results"
        and snapshot(phone)["limit"] == 36
        and snapshot(phone)["listScroll"] == 380,
    )
    phone.reload(wait_until="networkidle")
    expect(phone.get_by_role("dialog", name="附近廁所", exact=True)).to_be_visible()
    expect(phone.locator(".toilet-card").first).to_have_count(1)
    phone.wait_for_function("() => document.querySelector('.toilet-list').scrollTop === 380")
    check("Mobile reopening restores the results panel and its scroll position")
    mobile_recipient = context_for(browser, mobile=True)
    other_phone = page_for(mobile_recipient)
    other_phone.goto(list_url, wait_until="networkidle")
    expect(other_phone.get_by_role("dialog", name="附近廁所", exact=True)).to_be_visible()
    other_phone.wait_for_function("() => document.querySelector('.toilet-list').scrollTop === 380")
    check("A mobile recipient opens the same result panel, expanded cards and scroll position")
    phone.locator(".card-main").first.click()
    expect(phone.locator(".detail-panel")).to_be_visible()
    phone.set_viewport_size({"width": 390, "height": 600})
    phone.locator(".detail-panel").evaluate("e => e.scrollTop=e.scrollHeight")
    phone.wait_for_timeout(300)
    detail_url = phone.url
    detail_offset = snapshot(phone)["detailScroll"]
    other_phone.set_viewport_size({"width": 390, "height": 600})
    other_phone.goto(detail_url, wait_until="networkidle")
    expect(other_phone.locator(".detail-panel")).to_be_visible()
    other_phone.wait_for_function(
        "offset => Math.abs(document.querySelector('.detail-panel').scrollTop - offset) < 1",
        arg=detail_offset,
    )
    check("Toilet links restore the detailed panel at its navigation section", detail_offset > 0)
    phone.get_by_role("button", name="關閉廁所詳細資訊", exact=True).click()
    phone.get_by_role("button", name="地點與篩選", exact=True).click()
    phone.locator(".mobile-settings-body").evaluate("e => e.scrollTop=e.scrollHeight")
    phone.wait_for_timeout(300)
    settings_offset = snapshot(phone)["settingsScroll"]
    settings_url = phone.url
    other_phone.goto(settings_url, wait_until="networkidle")
    expect(other_phone.get_by_role("dialog", name="地點與篩選", exact=True)).to_be_visible()
    check("Mobile settings URLs open the same settings panel")
    other_phone.wait_for_function(
        """offset => { const element=document.querySelector('.mobile-settings-body');
            return Math.abs(element.scrollTop - offset) < 1; }""",
        arg=settings_offset,
    )
    check("Settings links restore the previous settings scroll position", settings_offset > 0)
    other_phone.set_viewport_size({"width": 844, "height": 390})
    expect(other_phone.get_by_role("dialog", name="地點與篩選", exact=True)).to_be_visible()
    check("Rotating a phone preserves its active panel and share context")
    phone.get_by_role("button", name="返回地圖", exact=True).click()
    phone.evaluate("""Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
        Object.defineProperty(navigator,'clipboard',{configurable:true,
            value:{writeText:async text=>{window.__copied=text;}}});""")
    phone.get_by_role("button", name="分享目前畫面", exact=True).click()
    expect(phone.get_by_role("status")).to_contain_text("已複製分享網址")
    check(
        "Browsers without native sharing copy the complete view URL",
        phone.evaluate("() => window.__copied") == phone.url,
    )
    phone.evaluate("() => {navigator.clipboard.writeText=async ()=>{throw new Error('blocked')};}")
    phone.locator(".mobile-results-trigger").click()
    phone.get_by_role("button", name="分享目前畫面", exact=True).click()
    expect(phone.get_by_role("dialog", name="分享目前畫面", exact=True)).to_be_visible()
    expect(phone.get_by_role("textbox", name="分享網址")).to_have_value(phone.url)
    phone.get_by_role("button", name="選取網址", exact=True).click()
    check(
        "Clipboard denial provides a selectable URL rather than losing the share action",
        phone.get_by_role("textbox", name="分享網址").evaluate(
            "e => e.selectionStart === 0 && e.selectionEnd === e.value.length"
        ),
    )
    phone.keyboard.press("Escape")
    expect(phone.get_by_role("dialog", name="附近廁所", exact=True)).to_be_visible()
    expect(phone.get_by_role("dialog", name="分享目前畫面", exact=True)).to_have_count(0)
    check(
        "Closing share fallback preserves the underlying mobile list and URL",
        snapshot(phone)["mobilePanel"] == "results",
    )
    phone.screenshot(path=str(OUT / "mobile-shared-list.png"))
    phone.get_by_role("button", name="返回地圖", exact=True).click()
    phone.get_by_role("button", name="地點與篩選", exact=True).click()
    phone.get_by_role("button", name="加入主畫面", exact=True).click()
    install_url = phone.url
    other_phone.goto(install_url, wait_until="networkidle")
    expect(other_phone.get_by_role("heading", name="把方便，帶在身邊。")).to_be_visible()
    check("Installation instructions have a shareable URL without triggering installation")
    malformed = context_for(
        browser,
        seed={
            "view-state": {"version": 1, "camera": None, "theme": "invalid", "region": "__proto__"}
        },
    )
    broken = page_for(malformed)
    broken.goto(
        f"{BASE_URL}/#v=1&region=busan&c=Infinity,90,99,0,0&theme=evil", wait_until="networkidle"
    )
    ready(broken)
    expect(broken.get_by_role("combobox", name="選擇城市")).to_have_value("busan")
    check(
        "Corrupt storage and invalid camera links recover to a usable city view",
        snapshot(broken)["camera"]["zoom"] <= 19 and snapshot(broken)["theme"] == "system",
    )
    blocked = context_for(browser)
    blocked.add_init_script("""Object.defineProperty(window,'localStorage',{configurable:true,
        get:()=>{throw new DOMException('Storage disabled','SecurityError');}});""")
    blocked_page = page_for(blocked)
    blocked_page.goto(shared, wait_until="networkidle")
    expect(blocked_page.locator(".detail-panel h2")).to_have_text(name)
    expect(blocked_page.get_by_role("combobox", name="選擇城市")).to_have_value("busan")
    check("Share URLs remain usable when browser preference storage is disabled")
    check("No unhandled browser errors in state restoration and sharing", not REPORT["pageErrors"])
    browser.close()
REPORT["passed"] = True
save_report()
print(json.dumps({"passed": True, "checks": len(REPORT["checks"])}), flush=True)
