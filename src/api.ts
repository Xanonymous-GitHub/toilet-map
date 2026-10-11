import type { Envelope, Region } from "./core";

type FetchPage = (url: string, options: RequestInit) => Promise<Response>;

export async function fetchRegion(
  region: Region,
  signal: AbortSignal,
  fetchPage: FetchPage = fetch,
  cache: RequestCache = "default",
): Promise<Envelope> {
  let cursor: number | null = 0;
  let combined: Envelope | null = null;
  const seen = new Set<string>();

  while (cursor !== null) {
    const response = await fetchPage(
      `/api/v1/toilets?region=${region}&limit=1000&cursor=${cursor}`,
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
      (page.nextCursor !== null &&
        (!Number.isInteger(page.nextCursor) || page.nextCursor <= cursor))
    ) {
      throw new Error("Toilet API returned an invalid page");
    }
    if (combined && (combined.dataVersion !== page.dataVersion || combined.total !== page.total)) {
      throw new Error("Toilet dataset changed during pagination; retry the request");
    }
    for (const item of page.items) {
      if (!item || typeof item.id !== "string" || seen.has(item.id)) {
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
