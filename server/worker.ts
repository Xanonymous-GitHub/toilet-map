import snapshot from "../data/dataset.json";
import osmOriginal from "../data/osm-shinjuku.json";
import { canRecommend, inBounds, REGIONS, type Toilet, validBbox } from "../src/core";
import { assets } from "./assets.generated";

type Asset = { body: string; type: string; binary?: boolean };
const records = snapshot.records as Toilet[];
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self)",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self' https://tile.openstreetmap.org; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
function respond(request: Request): Response {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) {
    const response = json({ error: "Method not allowed" }, 405);
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }
  if (url.pathname === "/api/v1/regions")
    return json({ regions: REGIONS, dataVersion: snapshot.dataVersion });
  if (url.pathname === "/api/v1/sources")
    return json({ sources: snapshot.sources, dataVersion: snapshot.dataVersion });
  if (url.pathname === "/api/v1/osm-export")
    return json({
      license: "ODbL-1.0",
      attribution: "© OpenStreetMap contributors",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      source: snapshot.sources.find((s) => s.id === "osm-shinjuku"),
      records: records.filter((t) => t.sourceId === "osm-shinjuku"),
      original: osmOriginal,
    });
  if (url.pathname === "/api/v1/toilets") {
    const region = url.searchParams.get("region") ?? "tokyo";
    if (region !== "tokyo" && region !== "seoul") return json({ error: "Unknown region" }, 400);
    const limitRaw = url.searchParams.get("limit") ?? "200";
    const cursorRaw = url.searchParams.get("cursor") ?? "0";
    if (!/^\d+$/.test(limitRaw) || !/^\d+$/.test(cursorRaw)) {
      return json({ error: "Invalid pagination" }, 400);
    }
    const limit = Number(limitRaw);
    const cursor = Number(cursorRaw);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1000 ||
      !Number.isSafeInteger(cursor) ||
      cursor < 0
    )
      return json({ error: "Invalid pagination" }, 400);
    const boxRaw = url.searchParams.get("bbox"),
      box = boxRaw ? validBbox(boxRaw) : null;
    if (boxRaw !== null && !box) return json({ error: "Invalid bbox" }, 400);
    if (box && (box[2] - box[0] > 5 || box[3] - box[1] > 5))
      return json({ error: "Search a smaller area" }, 400);
    const items = records.filter(
      (t) => t.region === region && canRecommend(t) && (!box || inBounds(t, box)),
    );
    const page = items.slice(cursor, cursor + limit);
    return json({
      items: page,
      sources: snapshot.sources.filter((s) => items.some((t) => t.sourceId === s.id)),
      dataVersion: snapshot.dataVersion,
      fetchedAt: snapshot.fetchedAt,
      nextCursor: cursor + limit < items.length ? cursor + limit : null,
      total: items.length,
      region,
      coverage: REGIONS[region].coverage,
    });
  }
  if (url.pathname.startsWith("/api/v1/toilets/")) {
    let id: string;
    try {
      id = decodeURIComponent(url.pathname.slice("/api/v1/toilets/".length));
    } catch {
      return json({ error: "Invalid ID" }, 400);
    }
    const record = records.find((t) => t.id === id && canRecommend(t));
    return record ? json(record) : json({ error: "Not found" }, 404);
  }
  if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
  let asset: Asset | undefined = assets[url.pathname];
  if (!asset && (url.pathname === "/" || url.pathname === "/index.html"))
    asset = assets["/index.html"];
  if (!asset) return new Response("Not found", { status: 404, headers });
  const body = asset.binary
    ? Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0))
    : asset.body;
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      ...headers,
      "content-type": asset.type,
      "cache-control": url.pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : url.pathname === "/sw.js"
          ? "no-store"
          : "no-cache",
      ...(url.pathname === "/sw.js" ? { "Service-Worker-Allowed": "/" } : {}),
    },
  });
}
export default {
  async fetch(request: Request): Promise<Response> {
    const response = respond(request);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};
