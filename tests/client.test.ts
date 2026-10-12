import { test } from "bun:test";
import assert from "node:assert/strict";
import worker from "../server/worker";
import { fetchRegion, fetchToilet, isToilet, ToiletLookupError } from "../src/api";
import type { Envelope, Toilet } from "../src/core";

const signal = new AbortController().signal;
const serverFetch = (path: string) => worker.fetch(new Request(`https://relief.example${path}`));

test("Direct toilet links load a complete validated record and forward cancellation", async () => {
  const envelope = (await (
    await serverFetch("/api/v1/toilets?region=busan&limit=1")
  ).json()) as Envelope;
  const expected = envelope.items[0];
  const toilet = await fetchToilet(expected.id, signal, (path, options) => {
    assert.equal(options.signal, signal);
    assert.equal(path, `/api/v1/toilets/${encodeURIComponent(expected.id)}`);
    return serverFetch(path);
  });
  assert.deepEqual(toilet, expected);
  assert.equal(isToilet(toilet), true);
});

test("Direct links reject invalid IDs, mismatched records and malformed cached data", async () => {
  const data = (await (
    await serverFetch("/api/v1/toilets?region=seoul&limit=1")
  ).json()) as Envelope;
  const toilet: Toilet = data.items[0];
  await assert.rejects(
    fetchToilet("<script>", signal, () => {
      throw new Error("Should not fetch");
    }),
    /Invalid toilet ID/,
  );
  for (const invalid of [
    null,
    {},
    { ...toilet, id: "other-id" },
    { ...toilet, hoursRaw: null },
    { ...toilet, male: 1 },
    { ...toilet, lat: 91 },
    { ...toilet, fee: { toString: null } },
    { ...toilet, country: "JP" },
  ])
    await assert.rejects(
      fetchToilet(toilet.id, signal, async () => Response.json(invalid)),
      /Invalid toilet lookup response/,
    );
});

test("Missing toilets remain distinguishable from network failures for offline restore", async () => {
  await assert.rejects(
    fetchToilet("osm-node-missing", signal, async () => new Response(null, { status: 404 })),
    (failure) => failure instanceof ToiletLookupError && failure.status === 404,
  );
  await assert.rejects(
    fetchToilet("osm-node-missing", signal, async () => {
      throw new TypeError("offline");
    }),
    TypeError,
  );
});

test("Client loads the complete Seoul dataset across every page", async () => {
  const data = await fetchRegion("seoul", signal, serverFetch);
  assert.equal(data.items.length, 5952);
  assert.equal(data.nextCursor, null);
  assert.equal(new Set(data.items.map((item) => item.id)).size, 5952);
});

test("Client rejects cyclic, duplicated, truncated and mixed-version pagination", async () => {
  const response = await serverFetch("/api/v1/toilets?region=seoul&limit=2");
  const base = (await response.json()) as Envelope;
  const first = { ...base, items: [base.items[0]], total: 2, nextCursor: 1 };
  const last = { ...base, items: [base.items[1]], total: 2, nextCursor: null };
  const cases = [
    [null],
    [{ ...first, nextCursor: 0 }],
    [first, { ...last, items: first.items }],
    [first, { ...last, items: [] }],
    [first, { ...last, dataVersion: "other-version" }],
    [first, { ...last, bounds: [126, 35, 127, 36] }],
  ];
  for (const pages of cases) {
    let index = 0;
    await assert.rejects(fetchRegion("seoul", signal, async () => Response.json(pages[index++])));
    assert.ok(index <= 2, "Invalid pagination must not cause an unbounded loop");
  }
});

test("Client forwards cancellation and reload cache mode, preserving HTTP failures", async () => {
  await assert.rejects(
    fetchRegion(
      "seoul",
      signal,
      async (_path, options) => {
        assert.equal(options.signal, signal);
        assert.equal(options.cache, "reload");
        return new Response("unavailable", { status: 503 });
      },
      "reload",
    ),
    /503/,
  );
});
