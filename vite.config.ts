import { createHash } from "node:crypto";
import { glob, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import cssnano from "cssnano";
import { minify } from "html-minifier-terser";
import license from "rollup-plugin-license";
import { optimize } from "svgo";
import { defineConfig } from "vite";
import { headers } from "./server/headers.ts";

// Worker responses enforce their own CSP. Version the URL when that policy
// changes so immutable browser, PWA and CDN caches cannot retain old permissions.
const workerPolicyRevision = createHash("sha256")
  .update(headers["Content-Security-Policy"])
  .digest("hex")
  .slice(0, 16);

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  publicDir: false,
  worker: {
    format: "es",
    rolldownOptions: {
      output: {
        comments: false,
        entryFileNames: `assets/[name]-[hash]-${workerPolicyRevision}.js`,
      },
    },
  },
  css: {
    postcss: {
      plugins: [cssnano({ preset: ["default", { discardComments: { removeAll: true } }] })],
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    target: "esnext",
    outDir: "dist/client",
    assetsDir: "assets",
    sourcemap: false,
    minify: true,
    cssMinify: "lightningcss",
    // MapLibre ships one indivisible ESM module. Keep its measured budget separate
    // from the 500 kB application budget, enforced below rather than silencing logs.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        comments: false,
        codeSplitting: {
          groups: [
            { name: "maplibre", test: /node_modules\/maplibre-gl\/dist\/maplibre-gl\.mjs$/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    license({
      thirdParty: {
        output: {
          file: "dist/client/third-party-licenses.json",
          template: (dependencies) =>
            JSON.stringify(
              dependencies.map(({ name, version, license, licenseText }) => ({
                name,
                version,
                license,
                licenseText,
              })),
            ),
        },
      },
    }),
    {
      name: "minified-html-and-public-assets",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler: (html) =>
          minify(html, {
            collapseWhitespace: true,
            removeComments: true,
            collapseBooleanAttributes: true,
            removeRedundantAttributes: true,
            minifyCSS: true,
            minifyJS: true,
          }),
      },
      async generateBundle() {
        for await (const entry of glob("**/*", { cwd: "public", withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const path = join(entry.parentPath, entry.name);
          const fileName = relative("public", path);
          const body = await readFile(path);
          const source = /\.(json|webmanifest)$/.test(fileName)
            ? JSON.stringify(JSON.parse(body.toString()))
            : fileName.endsWith(".svg")
              ? optimize(body.toString(), { multipass: true }).data
              : body;
          this.emitFile({ type: "asset", fileName, source });
        }
      },
    },
    {
      name: "bundle-size-budget",
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk") continue;
          const limit = chunk.name === "maplibre" ? 1_100_000 : 500_000;
          const size = new TextEncoder().encode(chunk.code).length;
          if (size > limit)
            this.error(`${chunk.fileName} exceeds its ${limit} byte budget: ${size}`);
        }
      },
    },
  ],
});
