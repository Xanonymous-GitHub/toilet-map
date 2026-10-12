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
  List,
  Map as MapIcon,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ThemeMenu } from "./components/ThemeMenu";

import { ToiletStatus } from "./components/ToiletStatus";
import { Button } from "./components/ui/button";
import { Collapsible, CollapsibleTrigger } from "./components/ui/collapsible";
import { Input } from "./components/ui/input";
import { NativeSelect, NativeSelectOption } from "./components/ui/native-select";
import { Toggle } from "./components/ui/toggle";
import {
  distanceMeters,
  type Filters,
  formatDistance,
  inBounds,
  inferRegion,
  matchesFilters,
  type NavigationProvider,
  navigationUrl,
  PLACES,
  REGION_IDS,
  REGIONS,
  type Region,
  type Toilet,
} from "./core";
import { type Position, useGeolocation } from "./hooks/useGeolocation";
import { useInstallPromotion } from "./hooks/useInstallPromotion";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { useToiletData } from "./hooks/useToiletData";
import { isRegion, searchableBounds } from "./regions";
import { readPreference, savePreference } from "./storage";
import { useTheme } from "./theme";

const MobilePanel = lazy(() => import("./components/MobilePanel"));

const InformationModal = lazy(() =>
  import("./components/InformationModal").then((module) => ({ default: module.InformationModal })),
);
const ToiletDetail = lazy(() =>
  import("./components/ToiletDetail").then((module) => ({ default: module.ToiletDetail })),
);

const MapView = lazy(async () => {
  // Let the search controls paint before creating the WebGL context.
  await new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === "function")
      requestIdleCallback(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 0);
  });
  return import("./MapView").catch(() => ({
    default: () => (
      <div className="map-stage">
        <div className="map-fallback">
          <MapIcon size={34} />
          <strong>互動地圖暫時無法載入</strong>
          <p>仍可用清單搜尋、查看資訊與導航；連線後請重新載入。</p>
        </div>
      </div>
    ),
  }));
});

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const initialRegion = () => {
  const r =
    new URLSearchParams(location.search).get("region") ??
    readPreference<Region>("region", "tokyo", isRegion);
  return isRegion(r) ? r : "tokyo";
};
export default function App() {
  const { theme, setTheme, dark } = useTheme();
  const mobile = useMobileLayout();
  const [mobilePanel, setMobilePanel] = useState<"settings" | "results" | null>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const settingsTrigger = useRef<HTMLButtonElement | null>(null);
  const resultsTrigger = useRef<HTMLButtonElement | null>(null);
  const skipPanelFocus = useRef(false);
  const openMobilePanel = (panel: "settings" | "results", trigger: HTMLElement) => {
    panelTrigger.current = trigger;
    skipPanelFocus.current = false;
    setSearchFocus(false);
    setMobilePanel(panel);
  };
  const closeMobilePanel = () => setMobilePanel(null);
  const restorePanelFocus = () => {
    if (!skipPanelFocus.current) panelTrigger.current?.focus();
  };
  useEffect(() => {
    if (!mobile) {
      setMobilePanel(null);
      setSearchFocus(false);
    }
  }, [mobile]);
  const promotion = useInstallPromotion();
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    readPreference("sidebar-open", true, (v): v is boolean => typeof v === "boolean"),
  );
  const [region, setRegion] = useState<Region>(initialRegion);
  const [center, setCenter] = useState<[number, number]>(REGIONS[region].center);
  const targetCenter = useRef(center);
  const movingToTarget = useRef(true);
  targetCenter.current = center;
  const [zoom, setZoom] = useState(REGIONS[region].zoom);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [searchFocus, setSearchFocus] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(12);
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
        setMobilePanel(null);
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
  const { data, loading, error, refresh } = useToiletData(region, bounds, notify);
  const receivePosition = useCallback(
    (p: Position) => {
      movingToTarget.current = true;
      const destination = inferRegion(p.lat, p.lon);
      if (destination && destination !== regionRef.current) {
        setRegion(destination);
        savePreference("region", destination);
        savePreference(`country-${REGIONS[destination].country}`, destination);
      }
      setBounds(null);
      setSelected(null);
      setCenter([p.lon, p.lat]);
      setZoom(15);
      if (!destination) notify("已定位。日韓以外尚無資料，可從城市選單選擇目的地。");
      else if (p.accuracy > 150)
        notify(`定位精度約 ${Math.round(p.accuracy)} 公尺，距離僅供參考。`);
    },
    [notify],
  );
  const { position, locating, locate, stopFollowing } = useGeolocation(receivePosition, notify);
  const switchRegion = useCallback(
    (next: Region, nextCenter = REGIONS[next].center, nextZoom = REGIONS[next].zoom) => {
      movingToTarget.current = true;
      setRegion(next);
      setCenter([...nextCenter]);
      setZoom(nextZoom);
      setBounds(null);
      setQuery("");
      setSelected(null);
      setLimit(12);
      stopFollowing();
      savePreference("region", next);
      savePreference(`country-${REGIONS[next].country}`, next);
    },
    [stopFollowing],
  );
  const onBounds = useCallback(
    (nextBounds: [number, number, number, number], nextCenter: [number, number]) => {
      // A previous flyTo may emit moveend while being replaced. Its bounds belong
      // to the old city and must not trigger a request for the newly selected city.
      if (
        movingToTarget.current &&
        (Math.abs(nextCenter[0] - targetCenter.current[0]) > 0.00005 ||
          Math.abs(nextCenter[1] - targetCenter.current[1]) > 0.00005)
      )
        return;
      movingToTarget.current = false;
      setBounds(nextBounds);
      setMapCenter(nextCenter);
    },
    [],
  );
  const onManual = useCallback(() => {
    movingToTarget.current = false;
    stopFollowing();
  }, [stopFollowing]);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (t) =>
        matchesFilters(t, filters, saved, now) &&
        (!q || `${t.name} ${t.nameEn ?? ""} ${t.address}`.toLowerCase().includes(q)),
    );
  }, [data, filters, saved, now, deferredQuery]);
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
    setLimit(12);
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
    skipPanelFocus.current = true;
    setMobilePanel(null);
    movingToTarget.current = true;
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
    skipPanelFocus.current = true;
    setMobilePanel(null);
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
  const showSources = () => {
    skipPanelFocus.current = true;
    setMobilePanel(null);
    setModal("sources");
  };
  const activeFilterCount = [filters.open, filters.wheelchair, filters.free, filters.saved].filter(
    Boolean,
  ).length;
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(date));
  const searchControl = (
    <div className="search-wrap">
      <Search size={19} />
      <Input
        type="search"
        enterKeyHint="search"
        aria-label="搜尋城市、車站或廁所"
        placeholder="城市、車站或廁所名稱"
        value={query}
        onFocus={() => setSearchFocus(true)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && mobile && !e.nativeEvent.isComposing) {
            e.preventDefault();
            setSearchFocus(false);
            panelTrigger.current = e.currentTarget;
            e.currentTarget.blur();
            skipPanelFocus.current = false;
            setMobilePanel("results");
          }
        }}
      />
      {query ? (
        <Button
          variant="ghost"
          type="button"
          className="search-clear"
          aria-label="清除搜尋"
          onClick={() => setQuery("")}
        >
          <X size={16} />
        </Button>
      ) : (
        <span className="search-shortcut">⌕</span>
      )}
      {searchFocus && (
        <>
          <Button
            variant="ghost"
            type="button"
            className="search-dismiss"
            aria-label="關閉搜尋建議"
            onClick={() => setSearchFocus(false)}
          />
          <div className="search-results">
            <div className="suggestion-title">{query ? "符合的地點" : "快速前往"}</div>
            {suggestions.length ? (
              suggestions.map((p) => (
                <Button
                  variant="ghost"
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
                </Button>
              ))
            ) : (
              <p>移動地圖，或搜尋目前城市的廁所名稱。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
  const destinationControls = (
    <>
      <fieldset className="region-tabs" aria-label="選擇國家">
        {(["JP", "KR"] as const).map((country) => (
          <Button
            variant="ghost"
            type="button"
            key={country}
            className={REGIONS[region].country === country ? "active" : ""}
            aria-pressed={REGIONS[region].country === country}
            onClick={() =>
              switchRegion(
                readPreference<Region>(
                  `country-${country}`,
                  country === "JP" ? "tokyo" : "seoul",
                  (value): value is Region => isRegion(value) && REGIONS[value].country === country,
                ),
              )
            }
          >
            <span className="flag" aria-hidden="true">
              {country === "JP" ? "🇯🇵" : "🇰🇷"}
            </span>
            {country === "JP" ? "日本" : "韓國"}
            <span className="region-sub">{country === "JP" ? "JAPAN" : "KOREA"}</span>
          </Button>
        ))}
      </fieldset>
      <div className="city-picker">
        <label htmlFor="city">
          <MapPin size={16} />
          城市與周邊
        </label>
        <NativeSelect
          id="city"
          aria-label="選擇城市"
          value={region}
          onChange={(e) => {
            if (isRegion(e.target.value)) switchRegion(e.target.value);
          }}
        >
          {REGION_IDS.filter((id) => REGIONS[id].country === REGIONS[region].country).map((id) => (
            <NativeSelectOption value={id} key={id}>
              {REGIONS[id].label}
              {data?.cityCounts[id] !== undefined
                ? ` · ${data.cityCounts[id].toLocaleString()} 筆`
                : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="filters">
        <Toggle
          variant="outline"
          type="button"
          className={filters.open ? "filter active" : "filter"}
          pressed={filters.open}
          onPressedChange={() => setFilter("open")}
        >
          <Clock size={15} />
          現在開放
        </Toggle>
        <Toggle
          variant="outline"
          type="button"
          className={filters.wheelchair ? "filter active" : "filter"}
          pressed={filters.wheelchair}
          onPressedChange={() => setFilter("wheelchair")}
        >
          <Accessibility size={16} />
          無障礙
        </Toggle>
        <Toggle
          variant="outline"
          type="button"
          className={filters.free ? "filter active" : "filter"}
          pressed={filters.free}
          onPressedChange={() => setFilter("free")}
        >
          免費
        </Toggle>
        <Button
          variant="ghost"
          type="button"
          aria-label="更多篩選條件"
          aria-expanded={moreFilters}
          className={`filter filter-icon ${moreFilters ? "active" : ""}`}
          hidden={mobile}
          onClick={() => setMoreFilters(!moreFilters)}
        >
          <SlidersHorizontal size={16} />
        </Button>
      </div>
      {(mobile || moreFilters) && (
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
    </>
  );
  const listHeading = (
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
  );
  const toiletList = (
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
          <Button variant="ghost" type="button" className="small-primary" onClick={refresh}>
            <RefreshCw size={15} />
            重新載入
          </Button>
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
          <Button
            variant="ghost"
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
          </Button>
        </div>
      ) : (
        visible.slice(0, limit).map(({ toilet: t, distance }) => (
          <article className={`toilet-card ${selected === t.id ? "selected" : ""}`} key={t.id}>
            <Button
              variant="ghost"
              type="button"
              className="card-main"
              onClick={() => selectToilet(t)}
            >
              <span className="sr-only">查看廁所詳情：</span>
              <span className="wc-icon" aria-hidden="true">
                WC
              </span>
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
            </Button>
            <div className="card-footer">
              <span>
                <ShieldCheck size={12} />
                {data?.sources.find((s) => s.id === t.sourceId)?.name ?? "公開資料"}
              </span>
              <Button
                variant="ghost"
                type="button"
                aria-label={saved.has(t.id) ? `取消收藏 ${t.name}` : `收藏 ${t.name}`}
                className={saved.has(t.id) ? "save saved" : "save"}
                onClick={() => toggleSave(t)}
              >
                <Heart size={16} fill={saved.has(t.id) ? "currentColor" : "none"} />
              </Button>
            </div>
          </article>
        ))
      )}
      {!loading && visible.length > limit && (
        <Button
          variant="ghost"
          type="button"
          className="show-more"
          onClick={() => setLimit((l) => l + 24)}
        >
          顯示更多（目前 {Math.min(limit, visible.length)}／{visible.length}）
          <ChevronDown size={16} />
        </Button>
      )}
    </div>
  );
  const coverageFooter = (
    <footer className="sidebar-footer">
      <div className="coverage-indicator">
        <span />
        {data?.countryTotal !== undefined
          ? `${REGIONS[region].country === "JP" ? "日本" : "韓國"}全域收錄 ${data.countryTotal.toLocaleString()} 筆`
          : REGIONS[region].coverage}
        <Button
          variant="ghost"
          type="button"
          aria-label="重新取得資料"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={12} />
        </Button>
      </div>
      <div className="footer-meta">
        <span>
          {data
            ? `${data.total.toLocaleString()} 筆在載入範圍 · ${dateLabel(data.fetchedAt)} 匯入`
            : "以官方與開放資料提供資訊"}
        </span>
        <Button variant="ghost" type="button" onClick={triggerInstall}>
          <ArrowDownToLine size={13} />
          加入主畫面
        </Button>
      </div>
    </footer>
  );
  return (
    <Collapsible
      open={sidebarOpen}
      onOpenChange={(open) => {
        setSidebarOpen(open);
        savePreference("sidebar-open", open);
      }}
      asChild
    >
      <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        {!mobile && sidebarOpen && (
          <aside id="search-sidebar" className="sidebar" aria-label="搜尋與廁所清單">
            <header className="brand-bar">
              <a className="brand" href="/">
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
              <Button
                variant="ghost"
                type="button"
                className="icon-button source-button"
                aria-label="資料來源與使用說明"
                onClick={showSources}
              >
                <Info size={21} />
              </Button>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="收起側邊欄"
                  aria-controls="search-sidebar"
                >
                  <PanelLeftClose />
                </Button>
              </CollapsibleTrigger>
            </header>
            <h1 className="sidebar-title">
              日韓廁所地圖<span>搜尋附近，隨時方便一點。</span>
            </h1>
            {searchControl}
            {destinationControls}
            {listHeading}
            {toiletList}
            {coverageFooter}
          </aside>
        )}
        <main className="map-panel">
          <Suspense
            fallback={
              <div className="map-stage">
                <div className="map-loading">
                  <MapPin size={18} />
                  地圖載入中
                </div>
              </div>
            }
          >
            <MapView
              dark={dark}
              items={filtered}
              center={center}
              zoom={zoom}
              selected={selected}
              position={position}
              now={now}
              onSelect={setSelected}
              onBounds={onBounds}
              onManual={() => {
                promotion.dismiss();
                onManual();
              }}
              onLocate={locate}
              locating={locating}
              locateSupported={Boolean(navigator.geolocation)}
            />
          </Suspense>
          {mobile && (
            <>
              <header className="mobile-map-header">
                <h1 className="sr-only">一點方便・日韓廁所地圖</h1>
                {searchControl}
                <Button
                  ref={settingsTrigger}
                  variant="outline"
                  size="icon"
                  className="mobile-settings-trigger"
                  aria-label={`地點與篩選${activeFilterCount ? `，已套用 ${activeFilterCount} 項` : ""}`}
                  aria-haspopup="dialog"
                  onClick={(event) => openMobilePanel("settings", event.currentTarget)}
                >
                  <SlidersHorizontal />
                  {activeFilterCount > 0 && (
                    <span className="filter-count">{activeFilterCount}</span>
                  )}
                </Button>
              </header>
              {!detail && (
                <Button
                  ref={resultsTrigger}
                  variant="outline"
                  className="mobile-results-trigger"
                  aria-label={`查看附近廁所，${loading ? "載入中" : `${visible.length} 間`}`}
                  aria-haspopup="dialog"
                  onClick={(event) => openMobilePanel("results", event.currentTarget)}
                >
                  <List />
                  <span>
                    附近廁所 <span className="count">{loading ? "…" : visible.length}</span>
                    <small>
                      {REGIONS[region].label}
                      {activeFilterCount ? " · 已篩選" : " · 查看清單"}
                    </small>
                  </span>
                  <ChevronRight />
                </Button>
              )}
            </>
          )}
          {!mobile && (
            <div className="map-top">
              <div className="map-toolbar">
                {!sidebarOpen && (
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      className="sidebar-trigger"
                      aria-label="展開側邊欄"
                      aria-controls={undefined}
                    >
                      <PanelLeftOpen />
                      <span>展開側邊欄</span>
                    </Button>
                  </CollapsibleTrigger>
                )}
                <span className="map-location-pill">
                  <MapPin size={16} />
                  <span>
                    {REGIONS[region].label}
                    <small>{REGIONS[region].local}</small>
                  </span>
                </span>
              </div>
              <div className="map-toolbar">
                {promotion.visible && (
                  <Button
                    variant="outline"
                    className="map-install"
                    aria-label="帶著地圖出發"
                    onClick={() => {
                      promotion.dismiss();
                      void triggerInstall();
                    }}
                    onPointerEnter={() => promotion.setHeld(true)}
                    onPointerLeave={() => promotion.setHeld(false)}
                    onFocus={() => promotion.setHeld(true)}
                    onBlur={() => promotion.setHeld(false)}
                  >
                    <ArrowDownToLine size={16} />
                    <span>帶著地圖出發</span>
                  </Button>
                )}
                {!sidebarOpen && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="toolbar-button source-button"
                    aria-label="資料來源與使用說明"
                    onClick={showSources}
                  >
                    <Info />
                  </Button>
                )}
                <ThemeMenu theme={theme} onChange={setTheme} />
              </div>
            </div>
          )}
          {(!online || data?.offline) && (
            <div className="offline-banner">
              <WifiOff size={15} />
              離線資料 · {data ? dateLabel(data.fetchedAt) : ""} 匯入，現場狀態未確認
            </div>
          )}
          {!selected && bounds && !searchableBounds(bounds) && (
            <div className="map-network-note" role="status">
              放大地圖以載入附近點位，或從城市選單快速前往。
            </div>
          )}
          {detail && (
            <Suspense fallback={null}>
              <ToiletDetail
                detail={detail}
                now={now}
                saved={saved}
                sources={data?.sources ?? []}
                onClose={() => setSelected(null)}
                toggleSave={toggleSave}
                openNav={openNav}
                copyAddress={copyAddress}
                restoreFocus={mobile ? () => resultsTrigger.current?.focus() : undefined}
              />
            </Suspense>
          )}
        </main>
        {mobile && mobilePanel && (
          <Suspense fallback={null}>
            <MobilePanel
              results={mobilePanel === "results"}
              onClose={closeMobilePanel}
              restoreFocus={restorePanelFocus}
            >
              {mobilePanel === "results" ? (
                <>
                  {listHeading}
                  {toiletList}
                </>
              ) : (
                <div className="mobile-settings-body">
                  {destinationControls}
                  <div className="mobile-appearance">
                    <span>地圖外觀</span>
                    <ThemeMenu theme={theme} onChange={setTheme} />
                  </div>
                  <Button className="mobile-apply" onClick={closeMobilePanel}>
                    查看地圖{activeFilterCount > 0 ? ` · ${activeFilterCount} 項篩選` : ""}
                  </Button>
                  <div className="mobile-secondary-actions">
                    <Button variant="ghost" onClick={showSources}>
                      <Info />
                      資料來源與使用說明
                    </Button>
                  </div>
                  {coverageFooter}
                  <div className="mobile-legend">
                    <span>
                      <i className="legend-dot open" />
                      時段開放
                    </span>
                    <span>
                      <i className="legend-dot unknown" />
                      時間未知
                    </span>
                    <span>
                      <i className="legend-dot closed" />
                      非開放時段
                    </span>
                  </div>
                </div>
              )}
            </MobilePanel>
          </Suspense>
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={17} />
            {toast}
            <Button
              variant="ghost"
              type="button"
              aria-label="關閉訊息"
              onClick={() => setToast("")}
            >
              <X size={15} />
            </Button>
          </div>
        )}
        {modal && (
          <Suspense fallback={null}>
            <InformationModal
              mode={modal}
              sources={data?.sources ?? []}
              onClose={() => setModal(null)}
              restoreFocus={mobile ? () => settingsTrigger.current?.focus() : undefined}
            />
          </Suspense>
        )}
      </div>
    </Collapsible>
  );
}
