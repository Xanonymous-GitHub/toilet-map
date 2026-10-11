import { test } from "bun:test";
import assert from "node:assert/strict";
import { assets } from "../server/assets.generated";
import worker from "../server/worker";

const call = (path: string) => worker.fetch(new Request(`https://relief.example${path}`));
test("Seoul API pagination covers all 4,455 records without duplicates", async () => {
  let cursor: number | null = 0;
  const ids: string[] = [];
  while (cursor !== null) {
    const res = await call(`/api/v1/toilets?region=seoul&limit=1000&cursor=${cursor}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.total, 4455);
    ids.push(...data.items.map((t: { id: string }) => t.id));
    cursor = data.nextCursor;
  }
  assert.equal(ids.length, 4455);
  assert.equal(new Set(ids).size, 4455);
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
  const path = Object.keys(assets).find((path) => /maplibre-gl-worker-.*\.mjs$/.test(path));
  assert.ok(path, "Vite must emit the map worker");
  const response = await call(path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
  assert.ok(assets["/sw.js"].body.includes(path), "Offline shell must precache its map worker");
});
test("OSM derivative export includes every source record and its original lineage", async () => {
  const r = await call("/api/v1/osm-export");
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.license, "ODbL-1.0");
  assert.equal(data.records.length, 64);
  assert.equal(data.original.elements.length, 64);
  assert.ok(data.records.every((t: { sourceId: string }) => t.sourceId === "osm-shinjuku"));
});
