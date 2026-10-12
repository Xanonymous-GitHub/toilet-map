import { test } from "bun:test";
import assert from "node:assert/strict";
import { defaultView, normalizeView, parseViewUrl, viewUrl } from "../src/view-state";

test("Shared views round-trip every filter, camera orientation and responsive panel", () => {
  for (let flags = 0; flags < 32; flags++) {
    for (const panel of ["map", "settings", "results", "sources", "install"]) {
      const view = normalizeView({
        ...defaultView("busan"),
        camera: { center: [129.075, 35.18], zoom: 16.25, bearing: -35, pitch: 42 },
        query: "釜山 廁所 & 서울 + 🚻",
        theme: "dark",
        sidebarOpen: false,
        moreFilters: true,
        limit: 84,
        listScroll: 678,
        settingsScroll: 71,
        detailScroll: 250,
        modalScroll: 300,
        filters: Object.fromEntries(
          ["open", "wheelchair", "free", "includeUnknown", "saved"].map((key, index) => [
            key,
            Boolean(flags & (2 ** index)),
          ]),
        ),
        selected: panel === "map" ? "seoul-123" : null,
        mobilePanel: panel === "settings" || panel === "results" ? panel : null,
        modal: panel === "sources" || panel === "install" ? panel : null,
        sharedSaved: flags & 16 ? ["seoul-123", "osm-way-456"] : null,
      });
      const url = viewUrl(new URL("https://relief.example/?utm_source=friend&region=tokyo"), view);
      const decoded = parseViewUrl(url);
      assert.ok(decoded?.cameraExplicit);
      assert.deepEqual(decoded.state, view);
      assert.equal(url.searchParams.get("utm_source"), "friend");
      assert.equal(url.searchParams.has("region"), false);
      assert.equal(viewUrl(url, decoded.state).href, url.href);
    }
  }
});

test("Explicit shared defaults clear selection and filters instead of borrowing personal preferences", () => {
  const decoded = parseViewUrl(viewUrl(new URL("https://relief.example"), defaultView("jeju")));
  assert.deepEqual(decoded?.state, defaultView("jeju"));
});

test("Camera serialization keeps metre-scale precision without unstable float URLs", () => {
  const view = normalizeView({
    ...defaultView(),
    camera: {
      center: [139.767123456, 35.681765432],
      zoom: 15.123456,
      bearing: 179.987654,
      pitch: 39.876543,
    },
  });
  assert.deepEqual(view.camera, {
    center: [139.76712, 35.68177],
    zoom: 15.12,
    bearing: 179.99,
    pitch: 39.88,
  });
  assert.deepEqual(
    parseViewUrl(viewUrl(new URL("https://relief.example"), view))?.state.camera,
    view.camera,
  );
});

test("Legacy city and toilet links work, while unrelated fragments remain untouched", () => {
  assert.equal(
    parseViewUrl(new URL("https://relief.example/?region=kurashiki"))?.state.region,
    "kurashiki",
  );
  const deep = parseViewUrl(new URL("https://relief.example/?toilet=osm-node-123"));
  assert.equal(deep?.state.selected, "osm-node-123");
  assert.equal(deep?.cameraExplicit, false);
  assert.equal(parseViewUrl(new URL("https://relief.example/#information")), null);
});

test("Malformed, unsupported and out-of-range links recover without unsafe state", () => {
  for (const camera of [
    "",
    "1,2",
    "180,91,12,0,0",
    "Infinity,35,12,0,0",
    "139,35,0,0,0",
    "139,35,12,361,0",
    "139,35,12,0,90",
    "139,,12,0,0",
  ]) {
    const parsed = parseViewUrl(
      new URL(
        `https://relief.example/#v=1&region=osaka&c=${camera}&toilet=<script>&theme=evil&sidebar=evil&f=free,unknown&limit=-3&scroll=Infinity`,
      ),
    );
    assert.deepEqual(parsed?.state.camera, defaultView("osaka").camera);
    assert.equal(parsed?.cameraExplicit, false);
    assert.equal(parsed?.state.selected, null);
    assert.equal(parsed?.state.theme, "system");
    assert.equal(parsed?.state.limit, 12);
    assert.equal(parsed?.state.listScroll, 0);
    assert.equal(parsed?.state.filters.free, true);
  }
  assert.equal(
    parseViewUrl(new URL("https://relief.example/#v=99&region=busan&f=free"))?.state.filters.free,
    false,
  );
  assert.equal(
    parseViewUrl(new URL("https://relief.example/#region=__proto__"))?.state.region,
    "tokyo",
  );
});

test("Personal history stays local, and shared collections contain only public facility IDs", () => {
  const view = { ...defaultView(), lastViewed: "osm-node-123" };
  const url = viewUrl(new URL("https://relief.example"), view, ["osm-node-123"]);
  assert.equal(new URLSearchParams(url.hash.slice(1)).has("saved"), false);
  assert.equal(parseViewUrl(url)?.state.lastViewed, null);
  view.filters.saved = true;
  const shared = parseViewUrl(viewUrl(url, view, ["osm-node-123", "osm-node-123", "osm-node-456"]));
  assert.deepEqual(shared?.state.sharedSaved, ["osm-node-123", "osm-node-456"]);
  assert.deepEqual(
    parseViewUrl(new URL("https://relief.example/#v=1&f=saved&saved=<script>"))?.state.sharedSaved,
    [],
  );
});

test("Long collections remain in the fragment and do not increase the hosting request query", () => {
  const view = defaultView();
  view.filters.saved = true;
  const ids = Array.from({ length: 1500 }, (_, index) => `osm-node-${index}`);
  const url = viewUrl(new URL("https://relief.example/"), view, ids);
  assert.ok(url.href.length > 8000);
  assert.equal(url.search, "");
  assert.equal(parseViewUrl(url)?.state.sharedSaved?.length, ids.length);
});

test("Only one panel opens, and corrupted local snapshots retain valid preferences", () => {
  const normalized = normalizeView({
    version: 1,
    region: "sapporo",
    theme: "dark",
    selected: "osm-node-123",
    modal: "sources",
    mobilePanel: "settings",
    camera: null,
    filters: { free: true, open: "yes" },
  });
  assert.equal(normalized.selected, null);
  assert.equal(normalized.mobilePanel, null);
  assert.equal(normalized.modal, "sources");
  assert.equal(normalized.filters.free, true);
  assert.equal(normalized.filters.open, false);
  assert.equal(normalized.theme, "dark");
  assert.deepEqual(normalized.camera, defaultView("sapporo").camera);
});
