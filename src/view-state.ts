import type { Filters, Region } from "./core";
import { isRegion, REGIONS } from "./regions";
import type { Theme } from "./theme";

export type Camera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};
export type ViewState = {
  version: 1;
  region: Region;
  camera: Camera;
  query: string;
  selected: string | null;
  lastViewed: string | null;
  filters: Filters;
  sharedSaved: string[] | null;
  theme: Theme;
  sidebarOpen: boolean;
  moreFilters: boolean;
  mobilePanel: "settings" | "results" | null;
  modal: "sources" | "install" | null;
  limit: number;
  listScroll: number;
};

const KEYS = [
  "v",
  "region",
  "c",
  "q",
  "f",
  "toilet",
  "theme",
  "sidebar",
  "panel",
  "more",
  "limit",
  "scroll",
  "saved",
];
const FILTER_KEYS = ["open", "wheelchair", "free", "includeUnknown", "saved"] as const;
export const isToiletId = (value: unknown): value is string =>
  typeof value === "string" && /^[\p{L}\p{N}:._-]{1,160}$/u.test(value);
export const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark" || value === "system";

export function defaultView(region: Region = "tokyo"): ViewState {
  return {
    version: 1,
    region,
    camera: {
      center: [...REGIONS[region].center],
      zoom: REGIONS[region].zoom,
      bearing: 0,
      pitch: 0,
    },
    query: "",
    selected: null,
    lastViewed: null,
    filters: { open: false, wheelchair: false, free: false, includeUnknown: false, saved: false },
    sharedSaved: null,
    theme: "system",
    sidebarOpen: true,
    moreFilters: false,
    mobilePanel: null,
    modal: null,
    limit: 12,
    listScroll: 0,
  };
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown, min: number, max: number, fallback: number, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? Number(value.toFixed(digits))
    : fallback;
const boolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

export function normalizeView(value: unknown, fallback = defaultView()): ViewState {
  const raw = object(value);
  const region = isRegion(raw.region) ? raw.region : fallback.region;
  const cameraFallback = region === fallback.region ? fallback.camera : defaultView(region).camera;
  const camera = object(raw.camera);
  const center = Array.isArray(camera.center) ? camera.center : [];
  const filters = object(raw.filters);
  const selected = isToiletId(raw.selected) ? raw.selected : null;
  const modal = raw.modal === "sources" || raw.modal === "install" ? raw.modal : null;
  const mobilePanel =
    raw.mobilePanel === "settings" || raw.mobilePanel === "results" ? raw.mobilePanel : null;
  return {
    version: 1,
    region,
    camera: {
      center: [
        number(center[0], -180, 180, cameraFallback.center[0], 5),
        number(center[1], -85, 85, cameraFallback.center[1], 5),
      ],
      zoom: number(camera.zoom, 5, 19, cameraFallback.zoom),
      bearing: number(camera.bearing, -180, 180, cameraFallback.bearing),
      pitch: number(camera.pitch, 0, 85, cameraFallback.pitch),
    },
    query: typeof raw.query === "string" ? raw.query.slice(0, 500) : fallback.query,
    selected: modal || mobilePanel ? null : selected,
    lastViewed: isToiletId(raw.lastViewed) ? raw.lastViewed : fallback.lastViewed,
    filters: Object.fromEntries(
      FILTER_KEYS.map((key) => [key, boolean(filters[key], fallback.filters[key])]),
    ) as Filters,
    sharedSaved: Array.isArray(raw.sharedSaved)
      ? [...new Set(raw.sharedSaved.filter(isToiletId))].sort()
      : null,
    theme: isTheme(raw.theme) ? raw.theme : fallback.theme,
    sidebarOpen: boolean(raw.sidebarOpen, fallback.sidebarOpen),
    moreFilters: boolean(raw.moreFilters, fallback.moreFilters),
    mobilePanel: modal ? null : mobilePanel,
    modal,
    limit: number(raw.limit, 12, 50_000, fallback.limit, 0),
    listScroll: number(raw.listScroll, 0, 10_000_000, fallback.listScroll, 0),
  };
}

export function parseViewUrl(url: URL): { state: ViewState; cameraExplicit: boolean } | null {
  const hash = new URLSearchParams(url.hash.slice(1));
  const params = KEYS.some((key) => hash.has(key)) ? hash : url.searchParams;
  if (!KEYS.some((key) => params.has(key))) return null;
  const defaults = defaultView(
    isRegion(params.get("region")) ? (params.get("region") as Region) : "tokyo",
  );
  if (params.has("v") && params.get("v") !== "1") return { state: defaults, cameraExplicit: false };
  const rawCamera = params.get("c")?.split(",");
  const parts = rawCamera?.map((part) => (part.trim() ? Number(part) : Number.NaN));
  const cameraValid =
    parts?.length === 5 &&
    parts.every(Number.isFinite) &&
    Math.abs(parts[0]) <= 180 &&
    Math.abs(parts[1]) <= 85 &&
    parts[2] >= 5 &&
    parts[2] <= 19 &&
    Math.abs(parts[3]) <= 180 &&
    parts[4] >= 0 &&
    parts[4] <= 85;
  const flags = new Set(params.get("f")?.split(","));
  const panel = params.get("panel");
  const state = normalizeView(
    {
      ...defaults,
      camera:
        cameraValid && parts
          ? { center: parts.slice(0, 2), zoom: parts[2], bearing: parts[3], pitch: parts[4] }
          : defaults.camera,
      query: params.get("q") ?? "",
      selected: params.get("toilet"),
      filters: Object.fromEntries(FILTER_KEYS.map((key) => [key, flags.has(key)])),
      sharedSaved: flags.has("saved")
        ? (params.get("saved")?.split(",").filter(Boolean) ?? [])
        : null,
      theme: params.get("theme"),
      sidebarOpen: params.get("sidebar") !== "0",
      moreFilters: params.get("more") === "1",
      mobilePanel: panel === "settings" || panel === "results" ? panel : null,
      modal: panel === "sources" || panel === "install" ? panel : null,
      limit: params.has("limit") ? Number(params.get("limit")) : 12,
      listScroll: params.has("scroll") ? Number(params.get("scroll")) : 0,
    },
    defaults,
  );
  return { state, cameraExplicit: Boolean(cameraValid) };
}

export function viewUrl(base: URL, view: ViewState, ownSaved: Iterable<string> = []): URL {
  const state = normalizeView(view);
  const url = new URL(base);
  for (const key of KEYS) url.searchParams.delete(key);
  const params = new URLSearchParams({
    v: "1",
    region: state.region,
    c: [...state.camera.center, state.camera.zoom, state.camera.bearing, state.camera.pitch].join(
      ",",
    ),
    theme: state.theme,
    sidebar: state.sidebarOpen ? "1" : "0",
    panel: state.modal ?? state.mobilePanel ?? "map",
  });
  if (state.query) params.set("q", state.query);
  const flags = FILTER_KEYS.filter((key) => state.filters[key]);
  if (flags.length) params.set("f", flags.join(","));
  if (state.filters.saved)
    params.set("saved", [...new Set(state.sharedSaved ?? ownSaved)].sort().join(","));
  if (state.selected) params.set("toilet", state.selected);
  if (state.moreFilters) params.set("more", "1");
  if (state.limit > 12) params.set("limit", String(state.limit));
  if (state.listScroll) params.set("scroll", String(state.listScroll));
  url.hash = params.toString();
  return url;
}
