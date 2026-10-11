import { test } from "bun:test";
import assert from "node:assert/strict";
import worker from "../server/worker";
import { fetchRegion } from "../src/api";
import type { Envelope } from "../src/core";

const signal = new AbortController().signal;
const serverFetch = (path: string) => worker.fetch(new Request(`https://relief.example${path}`));

test("Client loads the complete Seoul dataset across every page", async () => {
  const data = await fetchRegion("seoul", signal, serverFetch);
  assert.equal(data.items.length, 4455);
  assert.equal(data.nextCursor, null);
  assert.equal(new Set(data.items.map((item) => item.id)).size, 4455);
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
