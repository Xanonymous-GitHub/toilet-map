import {
  Accessibility,
  ArrowDownToLine,
  ArrowUpRight,
  Baby,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Heart,
  Info,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InformationModal } from "./components/InformationModal";
import { ToiletDetail } from "./components/ToiletDetail";
import { ToiletStatus } from "./components/ToiletStatus";
import {
  distanceMeters,
  type Filters,
  formatDistance,
  inBounds,
  matchesFilters,
  type NavigationProvider,
  navigationUrl,
  PLACES,
  REGIONS,
  type Region,
  type Toilet,
} from "./core";
import { type Position, useGeolocation } from "./hooks/useGeolocation";
import { useToiletData } from "./hooks/useToiletData";
import MapView from "./MapView";
import { readPreference, savePreference } from "./storage";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const initialRegion = () => {
  const r =
    new URLSearchParams(location.search).get("region") ??
    readPreference<Region>(
      "region",
      "tokyo",
      (value): value is Region => value === "tokyo" || value === "seoul",
    );
  return r === "seoul" ? "seoul" : "tokyo";
};
export default function App() {
  const [region, setRegion] = useState<Region>(initialRegion);
  const [center, setCenter] = useState<[number, number]>(REGIONS[region].center);
  const [zoom, setZoom] = useState(REGIONS[region].zoom);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(40);
  const [now, setNow] = useState(() => new Date());
  const [filters, setFilters] = useState<Filters>({
    open: false,
    wheelchair: false,
    free: false,
    includeUnknown: false,
    saved: false,
  });
  const [saved, setSaved] = useState<Set<string>>(
    () =>
      new Set(
        readPreference<string[]>(
          "saved",
          [],
          (value): value is string[] =>
            Array.isArray(value) && value.every((id) => typeof id === "string"),
        ),
      ),
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [modal, setModal] = useState<"sources" | "install" | null>(null);
  const [toast, setToast] = useState("");
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    regionRef = useRef(region);
  regionRef.current = region;
  const notify = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  }, []);
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    const updateOnline = () => setOnline(navigator.onLine);
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelected(null);
        setSearchFocus(false);
      }
    };
    addEventListener("online", updateOnline);
    addEventListener("offline", updateOnline);
    addEventListener("beforeinstallprompt", beforeInstall);
    addEventListener("keydown", handleEscape);
    return () => {
      clearInterval(interval);
      removeEventListener("online", updateOnline);
      removeEventListener("offline", updateOnline);
      removeEventListener("beforeinstallprompt", beforeInstall);
      removeEventListener("keydown", handleEscape);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const { data, loading, error, refresh } = useToiletData(region, notify);
  const receivePosition = useCallback(
    (p: Position) => {
      const destination: Region | null =
        p.lat >= 33 && p.lat <= 39 && p.lon >= 124 && p.lon <= 132
          ? "seoul"
          : p.lat >= 34 && p.lat <= 37 && p.lon >= 138 && p.lon <= 141
            ? "tokyo"
            : null;
      if (destination && destination !== regionRef.current) {
        setRegion(destination);
        savePreference("region", destination);
      }
      setCenter([p.lon, p.lat]);
      setZoom(15);
      if (!destination) notify("已定位。日韓以外尚無資料，可從城市選單查看東京或首爾。");
      else if (p.accuracy > 150)
        notify(`定位精度約 ${Math.round(p.accuracy)} 公尺，距離僅供參考。`);
    },
    [notify],
  );
  const { position, locating, locate, stopFollowing } = useGeolocation(receivePosition, notify);
  const switchRegion = useCallback(
    (next: Region, nextCenter = REGIONS[next].center, nextZoom = REGIONS[next].zoom) => {
      setRegion(next);
      setCenter([...nextCenter]);
      setZoom(nextZoom);
      setBounds(null);
      setQuery("");
      setSelected(null);
      setLimit(40);
      stopFollowing();
      savePreference("region", next);
    },
    [stopFollowing],
  );
  const onBounds = useCallback(
    (nextBounds: [number, number, number, number], nextCenter: [number, number]) => {
      setBounds(nextBounds);
      setMapCenter(nextCenter);
    },
    [],
  );
  const onManual = stopFollowing;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (t) =>
        matchesFilters(t, filters, saved, now) &&
        (!q || `${t.name} ${t.nameEn ?? ""} ${t.address}`.toLowerCase().includes(q)),
    );
  }, [data, filters, saved, now, query]);
  const anchorLat = position?.lat ?? mapCenter[1];
  const anchorLon = position?.lon ?? mapCenter[0];
  const visible = useMemo(
    () =>
      filtered
        .filter((t) => !bounds || inBounds(t, bounds))
        .map((t) => ({
          toilet: t,
          distance: distanceMeters({ lat: anchorLat, lon: anchorLon }, t),
        }))
        .sort((a, b) => a.distance - b.distance),
    [filtered, bounds, anchorLat, anchorLon],
  );
  const detail = data?.items.find((t) => t.id === selected) ?? null;
  const suggestions = PLACES.filter((p) =>
    `${p.name} ${p.alias}`.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 6);
  const setFilter = (key: keyof Filters) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
    setLimit(40);
  };
  const toggleSave = (t: Toilet) => {
    setSaved((old) => {
      const next = new Set(old);
      next.has(t.id) ? next.delete(t.id) : next.add(t.id);
      return next;
    });
  };
  useEffect(() => savePreference("saved", [...saved]), [saved]);
  const selectToilet = (t: Toilet) => {
    setSelected(t.id);
    setCenter([t.lon, t.lat]);
    setZoom(16);
    stopFollowing();
  };
  const copyAddress = async (t: Toilet) => {
    try {
      await navigator.clipboard.writeText(`${t.name}\n${t.address}\n${t.lat}, ${t.lon}`);
      notify("已複製名稱、地址與座標。");
    } catch {
      notify("此瀏覽器無法自動複製，請長按詳細資訊中的地址。");
    }
  };
  const triggerInstall = async () => {
    if (install) {
      await install.prompt();
      await install.userChoice;
      setInstall(null);
    } else setModal("install");
  };
  const openNav = (provider: NavigationProvider, t: Toilet) => {
    if (provider === "naver") {
      notify("已嘗試開啟 NAVER App；無法開啟時，可選 Kakao 網頁。");
      location.href = navigationUrl(provider, t, position ?? undefined, location.origin);
    } else
      window.open(
        navigationUrl(provider, t, position ?? undefined, location.origin),
        "_blank",
        "noopener,noreferrer",
      );
  };
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(date));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="brand-bar">
          <a className="brand" href="/" aria-label="一點方便首頁">
            <span className="brand-symbol">
              <MapPin size={23} strokeWidth={2.5} />
            </span>
            <span>
              <strong>
                一點方便<span className="brand-period">.</span>
              </strong>
              <small>A LITTLE RELIEF, ON THE GO</small>
            </span>
          </a>
          <button
            type="button"
            className="icon-button source-button"
            aria-label="資料來源與使用說明"
            onClick={() => setModal("sources")}
          >
            <Info size={21} />
          </button>
        </header>
        <div className="intro">
          <span className="eyebrow">
            <span /> JAPAN & KOREA
          </span>
          <h1>
            旅途，
            <br />
            隨時<span>方便一點。</span>
          </h1>
          <p>找到附近的廁所，把時間留給風景。</p>
        </div>
        <div className="search-wrap">
          <Search size={19} />
          <input
            aria-label="搜尋城市、車站或廁所"
            placeholder="城市、車站或廁所名稱"
            value={query}
            onFocus={() => setSearchFocus(true)}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="清除搜尋"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          ) : (
            <span className="search-shortcut">⌕</span>
          )}
          {searchFocus && (
            <>
              <button
                type="button"
                className="search-dismiss"
                aria-label="關閉搜尋建議"
                onClick={() => setSearchFocus(false)}
              />
              <div className="search-results">
                <div className="suggestion-title">{query ? "符合的地點" : "快速前往"}</div>
                {suggestions.length ? (
                  suggestions.map((p) => (
                    <button
                      type="button"
                      key={p.name}
                      onClick={() => {
                        switchRegion(p.region, p.center, p.zoom);
                        setSearchFocus(false);
                      }}
                    >
                      <MapPin size={16} />
                      <span>
                        {p.name}
                        <small>{p.alias.split(" ").slice(0, 2).join(" ")}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))
                ) : (
                  <p>移動地圖，或搜尋目前城市的廁所名稱。</p>
                )}
              </div>
            </>
          )}
        </div>
        <fieldset className="region-tabs" aria-label="選擇城市">
          {(["tokyo", "seoul"] as Region[]).map((r) => (
            <button
              type="button"
              key={r}
              className={region === r ? "active" : ""}
              aria-pressed={region === r}
              onClick={() => switchRegion(r)}
            >
              <span className={`flag ${r}`}>{r === "tokyo" ? "🇯🇵" : "🇰🇷"}</span>
              {REGIONS[r].label}
              <span className="region-sub">{r === "tokyo" ? "TOKYO" : "SEOUL"}</span>
            </button>
          ))}
        </fieldset>
        <div className="filters">
          <button
            type="button"
            className={filters.open ? "filter active" : "filter"}
            aria-pressed={filters.open}
            onClick={() => setFilter("open")}
          >
            <Clock size={15} />
            現在開放
          </button>
          <button
            type="button"
            className={filters.wheelchair ? "filter active" : "filter"}
            aria-pressed={filters.wheelchair}
            onClick={() => setFilter("wheelchair")}
          >
            <Accessibility size={16} />
            無障礙
          </button>
          <button
            type="button"
            className={filters.free ? "filter active" : "filter"}
            aria-pressed={filters.free}
            onClick={() => setFilter("free")}
          >
            免費
          </button>
          <button
            type="button"
            aria-label="更多篩選條件"
            aria-expanded={moreFilters}
            className={`filter filter-icon ${moreFilters ? "active" : ""}`}
            onClick={() => setMoreFilters(!moreFilters)}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
        {moreFilters && (
          <div className="extra-filters">
            <label>
              <input
                type="checkbox"
                checked={filters.includeUnknown}
                onChange={() => setFilter("includeUnknown")}
              />
              現在開放時，包含時間未知
            </label>
            <label>
              <input type="checkbox" checked={filters.saved} onChange={() => setFilter("saved")} />
              只看已收藏
            </label>
            <small>免費與無障礙篩選僅納入有提供資訊的設施。</small>
          </div>
        )}
        <div className="list-heading">
          <div>
            <strong>{filters.saved ? "收藏的廁所" : "這個區域的廁所"}</strong>
            <span className="count">{loading ? "…" : visible.length}</span>
          </div>
          <span>
            <ArrowDownToLine size={13} />
            {position ? "依直線距離" : "距離地圖中心"}
          </span>
        </div>
        <div className="toilet-list" aria-live="polite">
          {loading ? (
            <div className="loading-list">
              {[0, 1, 2].map((i) => (
                <div className="skeleton-card" key={i}>
                  <i />
                  <div>
                    <b />
                    <b />
                    <b />
                  </div>
                </div>
              ))}
              <p>正在整理附近的廁所…</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <WifiOff size={30} />
              <h3>資料暫時無法載入</h3>
              <p>{error}</p>
              <button type="button" className="small-primary" onClick={refresh}>
                <RefreshCw size={15} />
                重新載入
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <MapIcon size={32} />
              <h3>{filters.saved ? "這個區域還沒有收藏" : "這個區域沒有符合的資料"}</h3>
              <p>
                試試放大搜尋範圍、調整篩選，或選擇其他地點。
                <br />
                目前涵蓋 {REGIONS[region].coverage}。
              </p>
              <button
                type="button"
                className="small-primary"
                onClick={() => {
                  setFilters({
                    open: false,
                    wheelchair: false,
                    free: false,
                    includeUnknown: false,
                    saved: false,
                  });
                  switchRegion(region);
                }}
              >
                返回城市範圍
              </button>
            </div>
          ) : (
            visible.slice(0, limit).map(({ toilet: t, distance }) => (
              <article className={`toilet-card ${selected === t.id ? "selected" : ""}`} key={t.id}>
                <button
                  type="button"
                  className="card-main"
                  onClick={() => selectToilet(t)}
                  aria-label={`查看 ${t.name} 詳情`}
                >
                  <span className="wc-icon">WC</span>
                  <div className="card-content">
                    <div className="card-title-line">
                      <h2>{t.name}</h2>
                      <span className="distance">{formatDistance(distance)}</span>
                    </div>
                    <p className="card-address">{t.address || "地址未提供"}</p>
                    <div className="card-badges">
                      <ToiletStatus toilet={t} now={now} />
                      {t.wheelchair === "yes" && (
                        <span className="feature-badge" title="有無障礙廁所設施">
                          <Accessibility size={14} />
                        </span>
                      )}
                      {t.changingTable === "yes" && (
                        <span className="feature-badge" title="有尿布台">
                          <Baby size={14} />
                        </span>
                      )}
                      {t.access === "public_by_agreement" && (
                        <span className="mini-label">民間開放</span>
                      )}
                      {t.access === "unknown" && <span className="mini-label">條件未知</span>}
                    </div>
                  </div>
                  <ChevronRight className="card-chevron" size={17} />
                </button>
                <div className="card-footer">
                  <span>
                    <ShieldCheck size={12} />
                    {data?.sources.find((s) => s.id === t.sourceId)?.name ?? "公開資料"}
                  </span>
                  <button
                    type="button"
                    aria-label={saved.has(t.id) ? `取消收藏 ${t.name}` : `收藏 ${t.name}`}
                    className={saved.has(t.id) ? "save saved" : "save"}
                    onClick={() => toggleSave(t)}
                  >
                    <Heart size={16} fill={saved.has(t.id) ? "currentColor" : "none"} />
                  </button>
                </div>
              </article>
            ))
          )}
          {!loading && visible.length > limit && (
            <button type="button" className="show-more" onClick={() => setLimit((l) => l + 40)}>
              顯示更多（目前 {Math.min(limit, visible.length)}／{visible.length}）
              <ChevronDown size={16} />
            </button>
          )}
        </div>
        <footer className="sidebar-footer">
          <div className="coverage-indicator">
            <span />
            {REGIONS[region].coverage}
            <button type="button" aria-label="重新取得資料" onClick={refresh} disabled={loading}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="footer-meta">
            <span>
              {data
                ? `${data.total.toLocaleString()} 筆收錄 · ${dateLabel(data.fetchedAt)} 匯入`
                : "以官方與開放資料提供資訊"}
            </span>
            <button type="button" onClick={triggerInstall}>
              <ArrowDownToLine size={13} />
              加入主畫面
            </button>
          </div>
        </footer>
      </aside>
      <main className="map-panel">
        <MapView
          items={filtered}
          center={center}
          zoom={zoom}
          selected={selected}
          position={position}
          now={now}
          onSelect={setSelected}
          onBounds={onBounds}
          onManual={onManual}
          onLocate={locate}
          locating={locating}
          locateSupported={Boolean(navigator.geolocation)}
        />
        <div className="map-top">
          <span className="map-location-pill">
            <span className="flag">{region === "tokyo" ? "🇯🇵" : "🇰🇷"}</span>
            <span>
              {REGIONS[region].label}
              <small>{REGIONS[region].local}</small>
            </span>
            <span className="live-dot" />
            探索中
          </span>
          <button type="button" className="map-install" onClick={triggerInstall}>
            <ArrowDownToLine size={16} />
            <span>帶著地圖出發</span>
          </button>
        </div>
        {(!online || data?.offline) && (
          <div className="offline-banner">
            <WifiOff size={15} />
            離線資料 · {data ? dateLabel(data.fetchedAt) : ""} 匯入，現場狀態未確認
          </div>
        )}
        {!selected && (
          <div className="map-note">
            <Sparkles size={18} />
            <div>
              <strong>找到方便，也找到安心。</strong>
              <span>開放狀態依提供時段推估，出發前請留意使用限制。</span>
            </div>
          </div>
        )}
        {detail && (
          <ToiletDetail
            detail={detail}
            now={now}
            saved={saved}
            sources={data?.sources ?? []}
            onClose={() => setSelected(null)}
            toggleSave={toggleSave}
            openNav={openNav}
            copyAddress={copyAddress}
          />
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button type="button" aria-label="關閉訊息" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <InformationModal
          mode={modal}
          sources={data?.sources ?? []}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
