import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { StyleSpecification } from "maplibre-gl";
import { headers } from "../server/headers";
import {
  basemapStyle,
  basemapTileUrl,
  fallbackStyle,
  preserveOverlays,
  transformMapRequest,
} from "../src/basemap";

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

test("Official OSM requests override document referrer policy without bypassing browser cache", () => {
  const url = "https://tile.openstreetmap.org/13/7276/3226.png";
  assert.deepEqual(transformMapRequest(url), {
    url,
    referrerPolicy: "strict-origin-when-cross-origin",
  });
  for (const other of [
    "/api/v1/toilets",
    "https://tile.openstreetmap.org.example/13/7276/3226.png",
    "https://example.com/image.png",
  ])
    assert.deepEqual(transformMapRequest(other), { url: other });
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
    headers["Content-Security-Policy"].includes(
      "connect-src 'self' https://tile.openstreetmap.org",
    ),
  );
  assert.ok(!headers["Content-Security-Policy"].includes("tiles.openfreemap.org"));
});

test("Both appearances use the same official colored raster tiles and attribution", () => {
  const light = basemapStyle(false);
  const dark = basemapStyle(true);
  assert.deepEqual(light.sources, dark.sources);
  const source = light.sources.osm;
  assert.equal(source.type, "raster");
  if (source.type === "raster") {
    assert.deepEqual(source.tiles, [basemapTileUrl]);
    assert.equal(source.tileSize, 256);
    assert.match(source.attribution ?? "", /OpenStreetMap contributors/);
  }
  assert.equal(light.layers[1].type, "raster");
  assert.equal(dark.layers[1].type, "raster");
});
