import api from "./api";
import { assets } from "./assets.generated";
import { osmExport } from "./data";
import { headers } from "./headers";

type Asset = { body: string; type: string; binary?: boolean };
async function respond(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) return api.fetch(request);
  if (url.pathname === "/api/v1/osm-export") {
    const country = url.searchParams.get("country") ?? "JP";
    if (country === "JP" || country === "KR")
      return new Response(osmExport(country), {
        headers: {
          ...headers,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${country.toLowerCase()}-osm-toilets.json"`,
          "cache-control": "public, max-age=3600",
        },
      });
  }
  if (url.pathname.startsWith("/api/")) return api.fetch(request);
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
    const response = await respond(request);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};
