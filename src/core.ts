import { type Bbox, type Country, REGION_IDS, REGIONS, type Region } from "./regions";

export { type Bbox, type Country, REGION_IDS, REGIONS, type Region } from "./regions";
export type Known = "yes" | "no" | "limited" | "unknown";
export type Access =
  | "public"
  | "public_by_agreement"
  | "customers"
  | "permit"
  | "private"
  | "unknown";
export type Toilet = {
  id: string;
  region: Region;
  country: "JP" | "KR";
  sourceId: string;
  name: string;
  nameEn?: string;
  address: string;
  lat: number;
  lon: number;
  access: Access;
  fee: Known;
  wheelchair: Known;
  changingTable: Known;
  infantEquipment: Known;
  male: boolean | null;
  female: boolean | null;
  unisex: boolean | null;
  entranceNote: string;
  hoursRaw: string;
  timezone: "Asia/Tokyo" | "Asia/Seoul";
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  coordinateQuality: "source_position" | "osm_center";
};
export type Source = {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  count: number;
  note: string;
};
export type Envelope = {
  items: Toilet[];
  sources: Source[];
  dataVersion: string;
  fetchedAt: string;
  nextCursor: number | null;
  total: number;
  region: Region;
  coverage: string;
  bounds: Bbox;
  country: Country;
  countryTotal: number;
  cityCounts: Record<Region, number>;
  offline?: boolean;
};
export type Filters = {
  open: boolean;
  wheelchair: boolean;
  free: boolean;
  includeUnknown: boolean;
  saved: boolean;
};
const LANDMARKS: {
  name: string;
  alias: string;
  region: Region;
  center: [number, number];
  zoom: number;
}[] = [
  {
    name: "東京・江東區",
    alias: "Tokyo Koto 江東区",
    region: "tokyo",
    center: [139.798, 35.682],
    zoom: 13.6,
  },
  {
    name: "清澄白河",
    alias: "Kiyosumi 清澄 白河",
    region: "tokyo",
    center: [139.799, 35.682],
    zoom: 15,
  },
  {
    name: "門前仲町",
    alias: "Monzen Nakacho 門前",
    region: "tokyo",
    center: [139.796, 35.672],
    zoom: 15,
  },
  {
    name: "新宿車站",
    alias: "Shinjuku 新宿駅",
    region: "tokyo",
    center: [139.7004, 35.6909],
    zoom: 15,
  },
  {
    name: "首爾・市廳",
    alias: "Seoul City Hall 서울 시청",
    region: "seoul",
    center: [126.978, 37.5665],
    zoom: 15,
  },
  { name: "明洞", alias: "Myeongdong 명동", region: "seoul", center: [126.985, 37.561], zoom: 15 },
  {
    name: "弘大入口",
    alias: "Hongdae 홍대입구",
    region: "seoul",
    center: [126.924, 37.557],
    zoom: 15,
  },
  {
    name: "江南車站",
    alias: "Gangnam 강남역",
    region: "seoul",
    center: [127.0276, 37.498],
    zoom: 15,
  },
  {
    name: "景福宮",
    alias: "Gyeongbokgung 경복궁",
    region: "seoul",
    center: [126.977, 37.578],
    zoom: 15,
  },
];
export const PLACES = [
  ...REGION_IDS.map((region) => ({
    name: REGIONS[region].label,
    alias: REGIONS[region].alias,
    region,
    center: REGIONS[region].center,
    zoom: REGIONS[region].zoom,
  })),
  ...LANDMARKS,
];
export function inferRegion(lat: number, lon: number): Region | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < 20 ||
    lat > 46.5 ||
    lon < 122 ||
    lon > 146.5
  )
    return null;
  let closest: Region | null = null;
  let distance = 220000;
  for (const id of REGION_IDS) {
    const city = REGIONS[id];
    const meters = distanceMeters({ lat, lon }, { lat: city.center[1], lon: city.center[0] });
    if (meters < distance) {
      closest = id;
      distance = meters;
    }
  }
  return closest;
}
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
const clocks = new Map<
  string,
  { formatter: Intl.DateTimeFormat; timestamp: number; minutes: number }
>();

export function localMinutes(date: Date, timezone: string) {
  let clock = clocks.get(timezone);
  if (!clock) {
    clock = {
      formatter: new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      timestamp: Number.NaN,
      minutes: 0,
    };
    clocks.set(timezone, clock);
  }
  const timestamp = date.getTime();
  if (clock.timestamp === timestamp) return clock.minutes;
  const p = clock.formatter.formatToParts(date);
  clock.minutes =
    Number(p.find((x) => x.type === "hour")?.value) * 60 +
    Number(p.find((x) => x.type === "minute")?.value);
  clock.timestamp = timestamp;
  return clock.minutes;
}
export function parseHours(raw: string): [number, number][] | null {
  if (!raw?.trim()) return null;
  if (
    /\b(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|off|closed|sunrise|sunset)\b|平日|休日|祝日|曜日|週末|月曜|火曜|土曜|日曜|공휴일|주말|평일|요일|월\s*[~～-]\s*금|영업|營業|不定|季節|시간미상|휴관|하절기|동절기|하계|동계|매주/.test(
      raw,
    )
  )
    return null;
  if (/24\s*(時間|시간)|24\/7|全天/.test(raw) || /^(24시|상시)$/.test(raw.trim()))
    return [[0, 1440]];
  const matches = [
    ...raw.matchAll(/(\d{1,2}):(\d{2})(?::\d{2})?\s*[~～〜–—-]\s*(\d{1,2}):(\d{2})(?::\d{2})?/g),
  ];
  if (!matches.length) return null;
  const ranges: [number, number][] = [];
  for (const m of matches) {
    const sh = Number(m[1]),
      sm = Number(m[2]),
      eh = Number(m[3]),
      em = Number(m[4]);
    if (sh > 23 || eh > 25 || sm > 59 || em > 59 || (eh >= 24 && em !== 0 && eh === 24))
      return null;
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (start === end) return null;
    if (end < start) end += 1440;
    ranges.push([start, end]);
  }
  return ranges;
}
export type ScheduleState = "open" | "closed" | "unknown";
export function scheduleState(
  t: Pick<Toilet, "hoursRaw" | "timezone">,
  now = new Date(),
): ScheduleState {
  const ranges = parseHours(t.hoursRaw);
  if (!ranges) return "unknown";
  const m = localMinutes(now, t.timezone);
  return ranges.some(([start, end]) => (m >= start && m < end) || (end > 1440 && m < end - 1440))
    ? "open"
    : "closed";
}
export function displayHours(raw: string) {
  return (
    raw
      ?.trim()
      .replace(/\|+/g, " · ")
      .replace(/ · $/, "")
      .replace(/:00(?=\s*[~～–]|$)/g, ":00") || "開放時間未提供"
  );
}
export const ACCESS_LABEL: Record<Access, string> = {
  public: "公共設施",
  public_by_agreement: "民間開放",
  customers: "限顧客使用",
  permit: "需使用許可",
  private: "非公開",
  unknown: "使用條件未提供",
};
export function canRecommend(t: Toilet) {
  return !["private", "customers", "permit"].includes(t.access);
}
export function matchesFilters(t: Toilet, f: Filters, saved: Set<string>, now = new Date()) {
  if (!canRecommend(t)) return false;
  if (f.wheelchair && !["yes", "limited"].includes(t.wheelchair)) return false;
  if (f.free && t.fee !== "no") return false;
  if (f.saved && !saved.has(t.id)) return false;
  if (f.open) {
    const s = scheduleState(t, now);
    if (s !== "open" && !(f.includeUnknown && s === "unknown")) return false;
  }
  return true;
}
export type NavigationProvider = "google" | "apple" | "naver" | "kakao";
export function navigationUrl(
  provider: NavigationProvider,
  t: Pick<Toilet, "name" | "lat" | "lon">,
  origin?: { lat: number; lon: number },
  appOrigin = "https://example.com",
) {
  const dest = `${t.lat},${t.lon}`;
  if (provider === "google") {
    const u = new URL("https://www.google.com/maps/dir/");
    u.search = new URLSearchParams({
      api: "1",
      destination: dest,
      travelmode: "walking",
    }).toString();
    return u.href;
  }
  if (provider === "apple") {
    const u = new URL("https://maps.apple.com/");
    u.search = new URLSearchParams({ daddr: dest, dirflg: "w" }).toString();
    return u.href;
  }
  if (provider === "kakao")
    return origin
      ? `https://map.kakao.com/link/by/walk/${encodeURIComponent("目前位置")},${origin.lat},${origin.lon}/${encodeURIComponent(t.name)},${dest}`
      : `https://map.kakao.com/link/to/${encodeURIComponent(t.name)},${dest}`;
  const p: Record<string, string> = { appname: appOrigin };
  if (origin) {
    Object.assign(p, {
      slat: String(origin.lat),
      slng: String(origin.lon),
      sname: "目前位置",
      dlat: String(t.lat),
      dlng: String(t.lon),
      dname: t.name,
    });
    return `nmap://route/walk?${new URLSearchParams(p).toString()}`;
  }
  Object.assign(p, { lat: String(t.lat), lng: String(t.lon), name: t.name });
  return `nmap://place?${new URLSearchParams(p).toString()}`;
}
export function validBbox(input: string): [number, number, number, number] | null {
  const parts = input.split(",");
  if (parts.some((p) => !p.trim())) return null;
  const b = parts.map(Number);
  if (
    b.length !== 4 ||
    b.some((n) => !Number.isFinite(n)) ||
    b[0] < -180 ||
    b[2] > 180 ||
    b[1] < -90 ||
    b[3] > 90 ||
    b[0] >= b[2] ||
    b[1] >= b[3]
  )
    return null;
  return b as [number, number, number, number];
}
export function inBounds(t: Toilet, b: [number, number, number, number]) {
  return t.lon >= b[0] && t.lat >= b[1] && t.lon <= b[2] && t.lat <= b[3];
}
