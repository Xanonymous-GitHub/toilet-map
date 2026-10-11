import { mkdir, writeFile } from "node:fs/promises";
import { zipFunctions } from "@netlify/zip-it-and-ship-it";

await mkdir(".cache/netlify-functions", { recursive: true });
const functions = await zipFunctions("dist/netlify/functions", ".cache/netlify-functions", {
  config: { "*": { nodeBundler: "none", nodeVersion: "24.x" } },
});
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/netlify-package.json",
  JSON.stringify({ node: process.versions.node, functions }),
);
