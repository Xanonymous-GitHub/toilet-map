import type { Bbox, Envelope, Region, Toilet } from "./core";
import { validBbox } from "./core";
import { isRegion, REGIONS } from "./regions";
import { isToiletId } from "./view-state";

type FetchPage = (url: string, options: RequestInit) => Promise<Response>;

export function isToilet(value: unknown): value is Toilet {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    isToiletId(t.id) &&
    isRegion(t.region) &&
    REGIONS[t.region].country === t.country &&
    ["name", "sourceId", "address", "entranceNote", "hoursRaw", "fetchedAt"].every(
      (key) => typeof t[key] === "string",
    ) &&
    (t.nameEn === undefined || typeof t.nameEn === "string") &&
    typeof t.lat === "number" &&
    Number.isFinite(t.lat) &&
    Math.abs(t.lat) <= 85 &&
    typeof t.lon === "number" &&
    Number.isFinite(t.lon) &&
    Math.abs(t.lon) <= 180 &&
    typeof t.access === "string" &&
    ["public", "public_by_agreement", "customers", "permit", "private", "unknown"].includes(
      t.access,
    ) &&
    ["fee", "wheelchair", "changingTable", "infantEquipment"].every(
      (key) => typeof t[key] === "string" && ["yes", "no", "limited", "unknown"].includes(t[key]),
    ) &&
    ["male", "female", "unisex"].every((key) => t[key] === null || typeof t[key] === "boolean") &&
    t.timezone === (t.country === "JP" ? "Asia/Tokyo" : "Asia/Seoul") &&
    (t.sourceUpdatedAt === null || typeof t.sourceUpdatedAt === "string") &&
    (t.coordinateQuality === "source_position" || t.coordinateQuality === "osm_center")
  );
}

export class ToiletLookupError extends Error {
  constructor(public readonly status: number) {
    super(`Toilet lookup returned ${status}`);
  }
}

export async function fetchToilet(
  id: string,
  signal: AbortSignal,
  fetchPage: FetchPage = fetch,
): Promise<Toilet> {
  if (!isToiletId(id)) throw new Error("Invalid toilet ID");
  const response = await fetchPage(`/api/v1/toilets/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) throw new ToiletLookupError(response.status);
  const body: unknown = await response.json();
  if (!isToilet(body) || body.id !== id) throw new Error("Invalid toilet lookup response");
  return body;
}

export async function fetchRegion(
  region: Region,
  signal: AbortSignal,
  fetchPage: FetchPage = fetch,
  cache: RequestCache = "default",
  bounds?: Bbox,
): Promise<Envelope> {
  let cursor: number | null = 0;
  let combined: Envelope | null = null;
  const seen = new Set<string>();

  while (cursor !== null) {
    const response = await fetchPage(
      `/api/v1/toilets?region=${region}&limit=1000&cursor=${cursor}${bounds ? `&bbox=${bounds.join(",")}` : ""}`,
      { signal, cache },
    );
    if (!response.ok) throw new Error(`Toilet API returned ${response.status}`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") throw new Error("Toilet API returned an invalid page");
    const page = body as Envelope;
    if (
      !Array.isArray(page.items) ||
      !Array.isArray(page.sources) ||
      page.region !== region ||
      !Number.isInteger(page.total) ||
      page.total < 0 ||
      typeof page.dataVersion !== "string" ||
      typeof page.fetchedAt !== "string" ||
      !Array.isArray(page.bounds) ||
      !validBbox(page.bounds.join(",")) ||
      (page.country !== "JP" && page.country !== "KR") ||
      !Number.isInteger(page.countryTotal) ||
      page.countryTotal < 0 ||
      !page.cityCounts ||
      typeof page.cityCounts !== "object" ||
      (page.nextCursor !== null &&
        (!Number.isInteger(page.nextCursor) || page.nextCursor <= cursor))
    ) {
      throw new Error("Toilet API returned an invalid page");
    }
    if (
      combined &&
      (combined.dataVersion !== page.dataVersion ||
        combined.total !== page.total ||
        combined.bounds.join(",") !== page.bounds.join(","))
    ) {
      throw new Error("Toilet dataset changed during pagination; retry the request");
    }
    for (const item of page.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        seen.has(item.id) ||
        item.country !== page.country ||
        !Number.isFinite(item.lat) ||
        !Number.isFinite(item.lon)
      ) {
        throw new Error("Toilet API returned missing or duplicate IDs");
      }
      seen.add(item.id);
    }
    combined = combined ? { ...page, items: [...combined.items, ...page.items] } : page;
    if (
      combined.items.length > page.total ||
      (page.nextCursor !== null && page.items.length === 0)
    ) {
      throw new Error("Toilet API returned inconsistent pagination");
    }
    cursor = page.nextCursor;
  }
  if (!combined || combined.items.length !== combined.total) {
    throw new Error("Toilet API returned an incomplete dataset");
  }
  return combined;
}
