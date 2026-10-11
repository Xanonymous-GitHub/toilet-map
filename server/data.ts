import type { Bbox, Country, Source, Toilet } from "../src/core";
import { canRecommend, inBounds } from "../src/core";
import { idTiles, metadata, osmExports, tiles } from "./data.generated";

export const dataset = metadata;
const cache = new Map<string, Toilet[]>();
const pending = new Map<string, Promise<Toilet[]>>();
let cacheRecords = 0;
const maxCacheRecords = 8_000;

function uncompressed(payload: string) {
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  return new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
}
async function readTile(key: string): Promise<Toilet[]> {
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const request = new Response(uncompressed(tiles[key].payload)).json() as Promise<Toilet[]>;
  pending.set(key, request);
  let rows: Toilet[];
  try {
    rows = await request;
  } finally {
    pending.delete(key);
  }
  if (rows.length <= maxCacheRecords) {
    while (cache.size > 0 && cacheRecords + rows.length > maxCacheRecords) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cacheRecords -= cache.get(oldest)?.length ?? 0;
      cache.delete(oldest);
    }
    cache.set(key, rows);
    cacheRecords += rows.length;
  }
  return rows;
}
export async function queryToilets(country: Country, bounds: Bbox) {
  const result: Toilet[] = [];
  for (const [key, tile] of Object.entries(tiles)) {
    if (
      tile.country !== country ||
      tile.bounds[0] > bounds[2] ||
      tile.bounds[2] < bounds[0] ||
      tile.bounds[1] > bounds[3] ||
      tile.bounds[3] < bounds[1]
    )
      continue;
    const rows = await readTile(key);
    for (const row of rows) if (canRecommend(row) && inBounds(row, bounds)) result.push(row);
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export async function lookupToilet(id: string) {
  if (!Object.hasOwn(idTiles, id)) return null;
  const key = idTiles[id];
  if (!key) return null;
  const row = (await readTile(key)).find((row) => row.id === id);
  return row && canRecommend(row) ? row : null;
}
export function countrySources(country: Country): Source[] {
  return dataset.sources.filter((source) =>
    "country" in source
      ? source.country === country
      : source.id === (country === "JP" ? "koto" : "seoul"),
  ) as Source[];
}
export function osmExport(country: Country) {
  return uncompressed(osmExports[country]);
}
