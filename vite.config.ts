import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    outDir: "dist/client",
    assetsDir: "assets",
    sourcemap: false,
    // MapLibre ships one indivisible ESM module. Keep its measured budget separate
    // from the 500 kB application budget, enforced below rather than silencing logs.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
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
