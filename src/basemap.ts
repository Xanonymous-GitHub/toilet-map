import type { RequestParameters, StyleSpecification } from "maplibre-gl";

export const basemapTileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const basemapSource = "osm";
const overlaySources = new Set(["toilets", "position"]);

export function transformMapRequest(url: string): RequestParameters {
  return url.startsWith("https://tile.openstreetmap.org/")
    ? { url, referrerPolicy: "strict-origin-when-cross-origin" }
    : { url };
}

export function fallbackStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": dark ? "#101c18" : "#f5f4ee" },
      },
    ],
  };
}

export function basemapStyle(dark: boolean): StyleSpecification {
  return {
    ...fallbackStyle(dark),
    sources: {
      [basemapSource]: {
        type: "raster",
        tiles: [basemapTileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      ...fallbackStyle(dark).layers,
      {
        id: "basemap",
        type: "raster",
        source: basemapSource,
        paint: {
          // Retain OSM's colors and baked labels, with reduced glare in dark UI.
          "raster-brightness-max": dark ? 0.82 : 1,
          "raster-saturation": dark ? 0.12 : 0,
          "raster-contrast": dark ? 0.05 : 0,
        },
      },
    ],
  };
}

export function preserveOverlays(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  return {
    ...next,
    sources: {
      ...next.sources,
      ...Object.fromEntries(
        Object.entries(previous?.sources ?? {}).filter(([id]) => overlaySources.has(id)),
      ),
    },
    layers: [
      ...next.layers,
      ...(previous?.layers.filter(
        (layer) => "source" in layer && overlaySources.has(layer.source),
      ) ?? []),
    ],
  };
}
