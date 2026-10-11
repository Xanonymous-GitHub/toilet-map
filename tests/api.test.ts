import { test } from "bun:test";
import assert from "node:assert/strict";
import { assets } from "../server/assets.generated";
import { metadata } from "../server/data.generated";
import worker from "../server/worker";
import { type Envelope, inBounds, REGION_IDS, REGIONS } from "../src/core";
import { paddedBounds, searchableBounds } from "../src/regions";

const call = (path: string) => worker.fetch(new Request(`https://relief.example${path}`));
test("Seoul API pagination covers its full 5,952 candidate records without duplicates", async () => {
  let cursor: number | null = 0;
  const ids: string[] = [];
  while (cursor !== null) {
    const res = await call(`/api/v1/toilets?region=seoul&limit=1000&cursor=${cursor}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.total, 5952);
    ids.push(...data.items.map((t: { id: string }) => t.id));
    cursor = data.nextCursor;
  }
  assert.equal(ids.length, 5952);
  assert.equal(new Set(ids).size, 5952);
});
test("Every listed city has real candidates, consistent counts and valid country positions", async () => {
  assert.equal(REGION_IDS.length, 181);
  for (const region of REGION_IDS) {
    const response = await call(`/api/v1/toilets?region=${region}&limit=1`);
    assert.equal(response.status, 200);
    const page = (await response.json()) as Envelope;
    assert.equal(page.total, metadata.coverage.cityCounts[region]);
    assert.ok(page.total > 0, region);
    assert.equal(page.items[0].country, REGIONS[region].country);
    assert.ok(inBounds(page.items[0], page.bounds));
  }
});
test("Country bbox queries reach places outside the selected city", async () => {
  const box = REGIONS.busan.bounds;
  const response = await call(`/api/v1/toilets?region=seoul&bbox=${box.join(",")}`);
  const page = (await response.json()) as Envelope;
  assert.equal(page.region, "seoul");
  assert.equal(page.total, 463);
  assert.ok(page.items.every((item) => item.country === "KR" && inBounds(item, box)));
  assert.equal((await call("/api/v1/toilets?country=JP&region=busan")).status, 400);
});
test("A searchable viewport remains within the API limit after fetch padding", async () => {
  assert.equal(searchableBounds([139, 35, 143.4, 36]), false);
  const viewport: [number, number, number, number] = [139, 35, 143.1, 36];
  assert.equal(searchableBounds(viewport), true);
  const box = paddedBounds(viewport);
  const response = await call(`/api/v1/toilets?country=JP&bbox=${box.join(",")}&limit=1`);
  assert.equal(response.status, 200);
});
test("Region, bbox, cursor and limit reject invalid requests", async () => {
  for (const q of [
    "region=bad",
    "limit=0",
    "limit=1001",
    "cursor=-1",
    "bbox=140,35,139,36",
    "bbox=0,0,10,10",
    "bbox=",
    "cursor=",
    "cursor=9007199254740992",
    "limit=1e2",
    "country=bad",
  ])
    assert.equal((await call(`/api/v1/toilets?${q}`)).status, 400);
});
test("HEAD returns API headers without a body, and rejected methods advertise Allow", async () => {
  const response = await worker.fetch(
    new Request("https://relief.example/api/v1/regions", { method: "HEAD" }),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const rejected = await worker.fetch(
    new Request("https://relief.example/api/v1/regions", { method: "POST" }),
  );
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get("Allow"), "GET, HEAD");
});
test("Toilet lookup, empty bbox and unavailable routes are distinguishable", async () => {
  assert.equal((await call("/api/v1/toilets/jp%3Akoto%3A131083C00001")).status, 200);
  assert.equal((await call("/api/v1/toilets/missing")).status, 404);
  assert.equal((await call("/api/v1/toilets/__proto__")).status, 404);
  const empty = await (await call("/api/v1/toilets?region=seoul&bbox=126,35,126.1,35.1")).json();
  assert.deepEqual(empty.items, []);
  assert.equal(empty.total, 0);
  assert.equal((await call("/api/nope")).status, 404);
});
test("PWA assets and cache behavior have correct MIME and status", async () => {
  for (const [path, mime] of [
    ["/", "text/html"],
    ["/sw.js", "text/javascript"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/icons/icon-192.png", "image/png"],
  ]) {
    const r = await call(path);
    assert.equal(r.status, 200);
    assert.ok(r.headers.get("content-type")?.includes(mime));
  }
  assert.equal((await call("/sw.js")).headers.get("cache-control"), "no-store");
  assert.equal((await call("/missing.js")).status, 404);
});
test("The packaged map worker is JavaScript and included in the offline app shell", async () => {
  const path = Object.keys(assets).find((path) => /maplibre-gl-worker-.*\.m?js$/.test(path));
  assert.ok(path, "Vite must emit the map worker");
  const response = await call(path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
  assert.ok(assets["/sw.js"].body.includes(path), "Offline shell must precache its map worker");
});
test("Lazy map chunks stay within their budgets and are included in the offline shell", () => {
  const chunks = Object.entries(assets).filter(([path]) => /\/assets\/.*\.js$/.test(path));
  assert.ok(chunks.some(([path]) => /\/maplibre-/.test(path)));
  assert.ok(chunks.some(([path]) => /\/MapView-/.test(path)));
  for (const [path, asset] of chunks) {
    const limit = /\/maplibre-/.test(path) ? 1_100_000 : 500_000;
    assert.ok(
      new TextEncoder().encode(asset.body).length <= limit,
      `${path}: ${limit} byte budget`,
    );
    assert.ok(assets["/sw.js"].body.includes(path), `${path} must be available offline`);
  }
  assert.doesNotMatch(assets["/index.html"].body, /modulepreload[^>]+maplibre-/);
});
test("OSM derivative export includes every source record and its original lineage", async () => {
  const r = await call("/api/v1/osm-export?country=KR");
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.license, "ODbL-1.0");
  assert.equal(data.records.length, 5406);
  assert.equal(data.original.elements.length, 5406);
  assert.ok(data.records.every((t: { sourceId: string }) => t.sourceId === "osm-kr"));
});
