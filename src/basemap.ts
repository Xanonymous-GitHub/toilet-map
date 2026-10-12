import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export const basemapStyles = {
  light: "https://tiles.openfreemap.org/styles/bright",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

const overlaySources = new Set(["toilets", "position"]);

const darkFillColors: Record<string, string> = {
  water: "#204d67",
  landcover_ice_shelf: "#526a7d",
  landcover_glacier: "#526a7d",
  landuse_residential: "#263846",
  landcover_wood: "#294b39",
  landuse_park: "#2c5742",
  building: "#2e414f",
  "aeroway-area": "#354959",
  road_area_pier: "#354959",
};

const darkLineColors: Record<string, string> = {
  waterway: "#397696",
  "aeroway-taxiway": "#607d91",
  "aeroway-runway-casing": "#24333f",
  "aeroway-runway": "#607d91",
  road_pier: "#708090",
  highway_path: "#b7a487",
  highway_minor: "#607688",
  highway_major_casing: "#65583e",
  highway_major_inner: "#b8a06e",
  highway_major_subtle: "#b8a06e",
  highway_motorway_casing: "#785837",
  highway_motorway_inner: "#d2a46b",
  highway_motorway_subtle: "#d2a46b",
  railway_transit: "#a39bc3",
  railway_transit_dashline: "#293743",
  railway_minor: "#a39bc3",
  railway_minor_dashline: "#293743",
  railway: "#a39bc3",
  railway_dashline: "#293743",
  boundary_state: "#728296",
  "boundary_country_z0-4": "#728296",
  "boundary_country_z5-": "#728296",
};

function darkLayer(layer: LayerSpecification): LayerSpecification {
  if (layer.type === "background")
    return { ...layer, paint: { ...layer.paint, "background-color": "#16232d" } };
  if (layer.type === "fill" && darkFillColors[layer.id]) {
    // The upstream wood pattern is absent from its sprite. Solid forest color
    // also keeps green land cover distinguishable at small scales.
    const { "fill-pattern": _pattern, ...paint } = layer.paint ?? {};
    return {
      ...layer,
      paint: {
        ...paint,
        "fill-color": darkFillColors[layer.id],
        ...(layer.id === "building" ? { "fill-outline-color": "#496071" } : {}),
      },
    };
  }
  if (layer.type === "line" && darkLineColors[layer.id])
    return { ...layer, paint: { ...layer.paint, "line-color": darkLineColors[layer.id] } };
  if (layer.type === "symbol" && layer.layout?.["text-field"]) {
    const sourceLayer = layer["source-layer"] ?? "";
    const color = /water/.test(sourceLayer)
      ? "#9dcee5"
      : sourceLayer === "poi"
        ? "#ecd6ad"
        : "#d4dfe7";
    return {
      ...layer,
      paint: {
        ...layer.paint,
        "text-color": color,
        "text-halo-color": "#16232d",
        "text-halo-width": 1.4,
      },
    };
  }
  return layer;
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
  return dark ? { ...style, layers: style.layers.map(darkLayer) } : style;
}
