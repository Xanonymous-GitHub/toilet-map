import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import terser from "@rollup/plugin-terser";
import { build } from "rolldown";

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
await mkdir("dist/client/downloads", { recursive: true });
for (const country of ["JP", "KR"]) {
  const original = JSON.parse(await readFile(`data/osm-${country.toLowerCase()}.json`, "utf8"));
  const sourceExport = {
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    source: dataset.sources.find((source) => source.id === `osm-${country.toLowerCase()}`),
    records: dataset.records.filter((toilet) => toilet.sourceId === `osm-${country.toLowerCase()}`),
    original,
  };
  exports[country] = compress(sourceExport);
  await writeFile(
    `dist/client/downloads/${country.toLowerCase()}-osm-toilets.json`,
    JSON.stringify(sourceExport),
  );
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
const serviceWorkerBuild = await build({
  input: "src/service-worker.ts",
  platform: "browser",
  transform: {
    target: "esnext",
    define: {
      __PWA_CACHE_NAME__: JSON.stringify(`relief-${revision}`),
      __PWA_CORE_ASSETS__: JSON.stringify(precache),
    },
  },
  output: { format: "iife", minify: true, comments: false },
  write: false,
});
const sw = serviceWorkerBuild.output.find((entry) => entry.type === "chunk").code;
assets["/sw.js"] = { body: sw, type: "text/javascript; charset=utf-8" };
await writeFile(
  "server/assets.generated.ts",
  "export const assets:Record<string,{body:string;type:string;binary?:boolean}>=" +
    JSON.stringify(assets) +
    ";\n",
);
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await build({
  input: "server/worker.ts",
  platform: "browser",
  transform: { target: "esnext" },
  output: { file: "dist/server/index.js", format: "esm", minify: true, comments: false },
});
await build({
  input: "server/api.ts",
  platform: "node",
  transform: { target: "esnext" },
  output: { file: "dist/server/api.js", format: "esm", minify: true, comments: false },
});
await build({
  input: "netlify/functions/api.mjs",
  platform: "node",
  transform: { target: "esnext" },
  // Netlify's static route scanner requires ordinary string literals in config.
  // Terser's quote policy preserves them while minifying the entire function.
  output: {
    file: "dist/netlify/functions/api.mjs",
    format: "esm",
    minify: false,
    comments: false,
    plugins: [terser({ ecma: 2026, module: true, format: { comments: false, quote_style: 2 } })],
  },
});
await writeFile(
  "dist/.openai/hosting.json",
  JSON.stringify(JSON.parse(await readFile(".openai/hosting.json", "utf8"))),
);
await writeFile("dist/client/sw.js", sw);
console.log("Built Worker ESM with", files.length, "embedded PWA assets.");
