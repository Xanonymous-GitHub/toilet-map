import { type Country, REGIONS, validBbox } from "../src/core";
import { isRegion } from "../src/regions";
import { countrySources, dataset, lookupToilet, queryToilets } from "./data";
import { headers } from "./headers";

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
async function respond(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) {
    const response = json({ error: "Method not allowed" }, 405);
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }
  if (url.pathname === "/api/v1/regions")
    return json({ regions: REGIONS, dataVersion: dataset.dataVersion, coverage: dataset.coverage });
  if (url.pathname === "/api/v1/sources")
    return json({ sources: dataset.sources, dataVersion: dataset.dataVersion });
  if (url.pathname === "/api/v1/osm-export") {
    const country = url.searchParams.get("country") ?? "JP";
    if (country !== "JP" && country !== "KR") return json({ error: "Unknown country" }, 400);
    return Response.redirect(
      new URL(`/downloads/${country.toLowerCase()}-osm-toilets.json`, url),
      303,
    );
  }
  if (url.pathname === "/api/v1/toilets") {
    const countryRaw = url.searchParams.get("country");
    if (countryRaw !== null && countryRaw !== "JP" && countryRaw !== "KR")
      return json({ error: "Unknown country" }, 400);
    const region = url.searchParams.get("region") ?? (countryRaw === "KR" ? "seoul" : "tokyo");
    if (!isRegion(region)) return json({ error: "Unknown region" }, 400);
    const country: Country = countryRaw ?? REGIONS[region].country;
    if (country !== REGIONS[region].country)
      return json({ error: "City and country do not match" }, 400);
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
    const bounds = box ?? REGIONS[region].bounds;
    const items = await queryToilets(country, bounds);
    const page = items.slice(cursor, cursor + limit);
    return json({
      items: page,
      sources: countrySources(country),
      dataVersion: dataset.dataVersion,
      fetchedAt: dataset.fetchedAt,
      nextCursor: cursor + limit < items.length ? cursor + limit : null,
      total: items.length,
      region,
      coverage: REGIONS[region].coverage,
      bounds,
      country,
      countryTotal: dataset.coverage.countries[country],
      cityCounts: dataset.coverage.cityCounts,
    });
  }
  if (url.pathname.startsWith("/api/v1/toilets/")) {
    let id: string;
    try {
      id = decodeURIComponent(url.pathname.slice("/api/v1/toilets/".length));
    } catch {
      return json({ error: "Invalid ID" }, 400);
    }
    const record = await lookupToilet(id);
    return record ? json(record) : json({ error: "Not found" }, 404);
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await respond(request);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};
