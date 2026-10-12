import type { StyleSpecification } from "maplibre-gl";

export const basemapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

const overlaySources = new Set(["toilets", "position"]);

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

export async function loadBasemap(dark: boolean, signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(basemapStyles[dark ? "dark" : "light"], { signal });
  if (!response.ok) throw new Error(`Basemap unavailable: ${response.status}`);
  const style: StyleSpecification = await response.json();
  if (style.version !== 8 || !style.sources || !Array.isArray(style.layers))
    throw new Error("Invalid basemap style");
  return dark
    ? {
        ...style,
        layers: style.layers.map((layer) =>
          layer.type === "symbol" && layer.layout?.["text-field"]
            ? {
                ...layer,
                paint: {
                  ...layer.paint,
                  "text-color": "#a9b8b3",
                  "text-halo-color": "#101c18",
                  "text-halo-width": 1,
                },
              }
            : layer,
        ),
      }
    : style;
}
