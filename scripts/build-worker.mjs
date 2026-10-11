import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd(),
  client = resolve(root, "dist/client");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};
const files = [];
async function walk(dir) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, d.name);
    if (d.isDirectory()) await walk(p);
    else files.push(p);
  }
}
await walk(client);
files.sort();
const assets = {};
for (const p of files) {
  const binary = [".png", ".ico", ".woff2"].includes(extname(p));
  assets[`/${relative(client, p)}`] = {
    body: (await readFile(p)).toString(binary ? "base64" : "utf8"),
    type: mime[extname(p)] ?? "application/octet-stream",
    ...(binary ? { binary: true } : {}),
  };
}
const precache = Object.keys(assets)
  .filter((path) => path !== "/sw.js")
  .sort();
const serviceWorkerSource = await readFile("src/service-worker.ts", "utf8");
const dataVersion = JSON.parse(await readFile("data/dataset.json", "utf8")).dataVersion;
const dataset = JSON.parse(await readFile("data/dataset.json", "utf8"));
const groups = new Map();
const idTiles = {};
for (const toilet of dataset.records) {
  const key = `${toilet.country}:${Math.floor(toilet.lon * 4)}:${Math.floor(toilet.lat * 4)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(toilet);
  idTiles[toilet.id] = key;
}
const compress = (value) => gzipSync(JSON.stringify(value)).toString("base64");
const tiles = {};
for (const [key, records] of groups) {
  const [country, lon, lat] = key.split(":");
  tiles[key] = {
    country,
    bounds: [Number(lon) / 4, Number(lat) / 4, (Number(lon) + 1) / 4, (Number(lat) + 1) / 4],
    payload: compress(records),
  };
}
const exports = {};
for (const country of ["JP", "KR"]) {
  const original = JSON.parse(await readFile(`data/osm-${country.toLowerCase()}.json`, "utf8"));
  exports[country] = compress({
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    source: dataset.sources.find((source) => source.id === `osm-${country.toLowerCase()}`),
    records: dataset.records.filter((toilet) => toilet.sourceId === `osm-${country.toLowerCase()}`),
    original,
  });
}
const { records: _records, ...metadata } = dataset;
await writeFile(
  "server/data.generated.ts",
  `export const metadata=${JSON.stringify(metadata)};\nexport const tiles:Record<string,{country:string;bounds:[number,number,number,number];payload:string}>=${JSON.stringify(tiles)};\nexport const idTiles:Record<string,string>=${JSON.stringify(idTiles)};\nexport const osmExports:Record<string,string>=${JSON.stringify(exports)};\n`,
);
const revision = createHash("sha256")
  .update(JSON.stringify(assets))
  .update(serviceWorkerSource)
  .update(dataVersion)
  .digest("hex")
  .slice(0, 16);
const serviceWorkerBuild = await Bun.build({
  entrypoints: ["src/service-worker.ts"],
  format: "iife",
  target: "browser",
  minify: true,
  define: {
    __PWA_CACHE_NAME__: JSON.stringify(`relief-${revision}`),
    __PWA_CORE_ASSETS__: JSON.stringify(precache),
  },
});
if (!serviceWorkerBuild.success)
  throw new AggregateError(serviceWorkerBuild.logs, "Service worker build failed");
const sw = await serviceWorkerBuild.outputs[0].text();
assets["/sw.js"] = { body: sw, type: "text/javascript; charset=utf-8" };
await writeFile(
  "server/assets.generated.ts",
  "export const assets:Record<string,{body:string;type:string;binary?:boolean}>=" +
    JSON.stringify(assets) +
    ";\n",
);
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const workerBuild = await Bun.build({
  entrypoints: ["server/worker.ts"],
  outdir: "dist/server",
  naming: "index.js",
  format: "esm",
  target: "browser",
  minify: true,
});
if (!workerBuild.success) throw new AggregateError(workerBuild.logs, "Worker build failed");
await writeFile("dist/.openai/hosting.json", await readFile(".openai/hosting.json"));
await writeFile("dist/client/sw.js", sw);
console.log("Built Worker ESM with", files.length, "embedded PWA assets.");
