import { spyOn, test } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { StyleSpecification } from "maplibre-gl";
import { headers } from "../server/headers";
import { basemapStyles, fallbackStyle, loadBasemap, preserveOverlays } from "../src/basemap";

test("Basemap swaps keep live toilet data, selection and location above provider layers", () => {
  const previous: StyleSpecification = {
    version: 8,
    sources: {
      obsolete: { type: "raster", tiles: [] },
      toilets: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      position: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "old-basemap", type: "raster", source: "obsolete" },
      { id: "points", type: "circle", source: "toilets" },
      { id: "selected", type: "circle", source: "toilets", filter: ["==", "id", "selected-id"] },
      { id: "position-dot", type: "circle", source: "position" },
    ],
  };
  const next = fallbackStyle(true);
  const result = preserveOverlays(previous, next);
  assert.equal(result.sources.toilets, previous.sources.toilets);
  assert.equal(result.sources.position, previous.sources.position);
  assert.equal(result.sources.obsolete, undefined);
  assert.deepEqual(
    result.layers.map(({ id }) => id),
    ["background", "points", "selected", "position-dot"],
  );
  assert.deepEqual(result.layers[2], previous.layers[2]);
  assert.deepEqual(preserveOverlays(undefined, next), next);
  assert.notEqual(fallbackStyle(false).layers[0], next.layers[0]);
});

test("Style requests preserve browser cache defaults, cancellation and provider failure status", async () => {
  const signal = new AbortController().signal;
  const style = fallbackStyle(false);
  const fetch = spyOn(globalThis, "fetch");
  try {
    fetch.mockResolvedValueOnce(Response.json(style));
    assert.deepEqual(await loadBasemap(false, signal), style);
    assert.deepEqual(fetch.mock.calls[0], [basemapStyles.light, { signal }]);
    fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await assert.rejects(loadBasemap(true, signal), /403/);
    fetch.mockResolvedValueOnce(Response.json({ error: "Service unavailable" }));
    await assert.rejects(loadBasemap(false, signal), /Invalid basemap style/);
    fetch.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    await assert.rejects(
      loadBasemap(true, signal),
      (error) => error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    fetch.mockRestore();
  }
});

test("Sites, Netlify and Vercel permit provider assets with identical CSP and referrer policy", async () => {
  const netlify = Bun.TOML.parse(await readFile("netlify.toml", "utf8")) as {
    headers: { values: Record<string, string> }[];
  };
  const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
  const vercelHeaders = Object.fromEntries(
    vercel.headers[0].headers.map(({ key, value }: { key: string; value: string }) => [key, value]),
  );
  for (const name of ["Content-Security-Policy", "Referrer-Policy"] as const) {
    assert.equal(netlify.headers[0].values[name], headers[name]);
    assert.equal(vercelHeaders[name], headers[name]);
  }
  assert.ok(
    headers["Content-Security-Policy"].includes("connect-src 'self' https://tiles.openfreemap.org"),
  );
  assert.ok(!headers["Content-Security-Policy"].includes("tile.openstreetmap.org"));
});

test("Dark map labels stay legible while provider geometry and label expressions are preserved", async () => {
  const style: StyleSpecification = {
    ...fallbackStyle(true),
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#101c18" } },
      {
        id: "street",
        type: "symbol",
        source: "openmaptiles",
        layout: { "text-field": ["get", "name"] },
        paint: { "text-color": "#333", "text-halo-width": 0.5 },
      },
    ],
  };
  const fetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(style));
  try {
    const loaded = await loadBasemap(true, new AbortController().signal);
    assert.deepEqual(loaded.layers[0], style.layers[0]);
    assert.equal(loaded.layers[1].type, "symbol");
    if (loaded.layers[1].type === "symbol") {
      assert.deepEqual(loaded.layers[1].layout, style.layers[1].layout);
      assert.equal(loaded.layers[1].paint?.["text-color"], "#a9b8b3");
      assert.equal(loaded.layers[1].paint?.["text-halo-width"], 1);
    }
  } finally {
    fetch.mockRestore();
  }
});
