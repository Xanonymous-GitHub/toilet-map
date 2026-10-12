import { test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { glob, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { parseSync } from "rolldown/utils";
import { headers } from "../server/headers";
import worker from "../server/worker";

test("Map worker URL versions its response CSP across CDN and PWA caches", async () => {
  const revision = createHash("sha256")
    .update(headers["Content-Security-Policy"])
    .digest("hex")
    .slice(0, 16);
  const workers = await Array.fromAsync(glob("dist/client/assets/maplibre-gl-worker-*.js"));
  assert.equal(workers.length, 1);
  const path = workers[0].replace("dist/client", "");
  assert.ok(path.endsWith(`-${revision}.js`), path);
  const staleRevision = createHash("sha256")
    .update(
      headers["Content-Security-Policy"].replaceAll(
        "tile.openstreetmap.org",
        "tiles.openfreemap.org",
      ),
    )
    .digest("hex")
    .slice(0, 16);
  assert.notEqual(revision, staleRevision);
  const response = await worker.fetch(new Request(`https://relief.example${path}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), headers["Content-Security-Policy"]);
  assert.match(response.headers.get("cache-control") ?? "", /immutable/);
  assert.match(response.headers.get("content-type") ?? "", /javascript/);
  assert.equal(await response.text(), await readFile(workers[0], "utf8"));
  assert.ok((await readFile("dist/client/sw.js", "utf8")).includes(path));
  let referenced = false;
  for await (const chunk of glob("dist/client/assets/MapView-*.js")) {
    referenced ||= (await readFile(chunk, "utf8")).includes(path);
  }
  assert.ok(referenced, "MapView must load the new worker URL");
});

test("Every production text asset is minified and JavaScript contains no comments", async () => {
  for await (const path of glob("dist/**/*.{js,mjs,css,json,webmanifest,html,svg}")) {
    const source = await readFile(path, "utf8");
    if (/\.m?js$/.test(path)) {
      const parsed = parseSync(path, source);
      assert.equal(parsed.errors.length, 0, path);
      assert.equal(parsed.comments.length, 0, path);
    } else if (/\.(json|webmanifest)$/.test(path)) {
      assert.equal(source, JSON.stringify(JSON.parse(source)), path);
    } else if (/\.(html|svg)$/.test(path)) {
      assert.ok(!source.includes("<!--"), path);
      assert.ok(!source.includes("\n"), path);
    } else {
      assert.ok(!source.includes("/*"), path);
    }
  }
  const licenses = JSON.parse(await readFile("dist/client/third-party-licenses.json", "utf8"));
  for (const name of ["react", "react-dom", "maplibre-gl", "@radix-ui/react-dialog", "cn"]) {
    assert.ok(
      licenses.some(
        (entry: { name: string; licenseText: string }) => entry.name === name && entry.licenseText,
      ),
      name,
    );
  }
});

test("Netlify and Vercel Web handlers run on Node with queries, HEAD and CDN exports", () => {
  const result = Bun.spawnSync(
    [
      "node",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import netlify from './netlify/functions/api.mjs';
    import vercel from './api/handler.mjs';
    for (const handle of [netlify, (request) => vercel.fetch(request)]) {
      const response = await handle(new Request('https://relief.example/api/v1/toilets?region=busan&limit=1'));
      const page = await response.json();
      assert.equal(response.status, 200);
      assert.equal(page.total, 463);
      assert.equal(page.items.length, 1);
      assert.equal(page.items[0].country, 'KR');
      const head = await handle(new Request('https://relief.example/api/v1/regions', {method:'HEAD'}));
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal((await handle(new Request('https://relief.example/api/v1/toilets?country=bad'))).status, 400);
      const exported = await handle(new Request('https://relief.example/api/v1/osm-export?country=JP'));
      assert.equal(exported.status, 303);
      assert.equal(exported.headers.get('location'), 'https://relief.example/downloads/jp-osm-toilets.json');
    }
    const rewritten = await vercel.fetch(new Request('https://relief.example/api/handler?__relief_path=toilets&region=jeju&limit=1'));
    const page = await rewritten.json();
    assert.equal(page.region, 'jeju');
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].country, 'KR');
  `,
    ],
    { timeout: 15000, stdout: "pipe", stderr: "pipe" },
  );
  assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr).slice(-2000));
});

test("Netlify official packager includes the production API and its custom route", async () => {
  await rm("test-results/netlify-package.json", { force: true });
  const result = Bun.spawnSync(["node", "tooling/netlify/check.mjs"], {
    timeout: 15000,
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr).slice(-2000));
  const packaged = JSON.parse(await readFile("test-results/netlify-package.json", "utf8"));
  const functions = packaged.functions;
  assert.equal(functions.length, 1);
  assert.equal(functions[0].name, "api");
  assert.equal(functions[0].runtimeAPIVersion, 2);
  assert.ok(functions[0].routes?.some((route: { pattern: string }) => route.pattern === "/api/*"));
  const size = (await stat(functions[0].path)).size;
  assert.ok(size < 10_000_000);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/deployment-report.json",
    JSON.stringify({
      node: packaged.node,
      netlify: { name: "api", runtimeAPIVersion: 2, route: "/api/*", zipBytes: size },
      vercel: { handler: "api/handler.mjs", rewrittenRequests: true },
      liveProviderDeployment: false,
    }),
  );
}, 20000);
