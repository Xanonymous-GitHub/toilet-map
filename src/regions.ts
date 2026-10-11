import catalog from "../data/regions.json";

export type Country = "JP" | "KR";
export type Region = keyof typeof catalog;
export type Bbox = [number, number, number, number];
type RegionDefinition = {
  label: string;
  alias: string;
  local: string;
  country: Country;
  center: [number, number];
  zoom: number;
  bounds: Bbox;
  coverage: string;
};

export const REGIONS = Object.fromEntries(
  Object.entries(catalog).map(([id, city]) => {
    if (city.country !== "JP" && city.country !== "KR") throw new Error("Invalid city country");
    return [
      id,
      {
        ...city,
        center: city.center as [number, number],
        bounds: city.bounds as Bbox,
        coverage: `${city.label}與周邊 · 已收錄點位`,
      },
    ];
  }),
) as Record<Region, RegionDefinition>;

export const REGION_IDS = Object.keys(REGIONS) as Region[];
export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && Object.hasOwn(REGIONS, value);
}
export function containsBounds(outer: Bbox, inner: Bbox) {
  return (
    inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
  );
}
export function searchableBounds(bounds: Bbox) {
  const padded = paddedBounds(bounds);
  return padded[2] - padded[0] <= 5 && padded[3] - padded[1] <= 5;
}
export function paddedBounds(bounds: Bbox): Bbox {
  const lonMargin = Math.max(0.02, (bounds[2] - bounds[0]) * 0.1);
  const latMargin = Math.max(0.02, (bounds[3] - bounds[1]) * 0.1);
  return [
    bounds[0] - lonMargin,
    bounds[1] - latMargin,
    bounds[2] + lonMargin,
    bounds[3] + latMargin,
  ].map((value) => Math.round(value * 10000) / 10000) as Bbox;
}
