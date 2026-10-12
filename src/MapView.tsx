import { LocateFixed, Map as MapIcon, MapPin, Minus, Plus } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  basemapSource,
  basemapStyle,
  fallbackStyle,
  preserveOverlays,
  transformMapRequest,
} from "./basemap";
import { Button } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { scheduleState, type Toilet } from "./core";
import type { Camera } from "./view-state";

maplibregl.setWorkerUrl(mapWorkerUrl);

type Props = {
  dark: boolean;
  items: Toilet[];
  camera: Camera;
  selected: string | null;
  position: { lat: number; lon: number; accuracy: number } | null;
  now: Date;
  onSelect: (id: string) => void;
  onBounds: (b: [number, number, number, number], camera: Camera) => void;
  onManual: () => void;
  onLocate: () => void;
  locating: boolean;
  locateSupported: boolean;
};
export default function MapView(p: Props) {
  const holder = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    latest = useRef(p),
    clusters = useRef<Map<string, maplibregl.Marker>>(new Map());
  latest.current = p;
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [tileError, setTileError] = useState(false),
    [basemapLoading, setBasemapLoading] = useState(true),
    [basemapAttempt, setBasemapAttempt] = useState(0);
  const reportCamera = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const bounds = m.getBounds(),
      center = m.getCenter();
    latest.current.onBounds(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      {
        center: [center.lng, center.lat],
        zoom: m.getZoom(),
        bearing: m.getBearing(),
        pitch: m.getPitch(),
      },
    );
  }, []);
  useEffect(() => {
    const container = holder.current;
    if (!container) return;
    const markers = clusters.current;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container,
        center: latest.current.camera.center,
        zoom: latest.current.camera.zoom,
        bearing: latest.current.camera.bearing,
        pitch: latest.current.camera.pitch,
        minZoom: 5,
        maxZoom: 19,
        // Cap GPU work on high-DPI phones while keeping the map and UI sharp.
        pixelRatio: Math.min(devicePixelRatio, 2),
        transformRequest: transformMapRequest,
        // Use fetch to preserve cache headers and the per-request referrer policy.
        refreshExpiredTiles: true,
        attributionControl: { compact: false },
        style: fallbackStyle(latest.current.dark),
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    const observer = new ResizeObserver(() => {
      const ratio = Math.min(devicePixelRatio, 2);
      if (m.getPixelRatio() !== ratio) m.setPixelRatio(ratio);
      else m.resize();
    });
    observer.observe(container);
    const emitBounds = reportCamera;
    let initialized = false;
    m.on("style.load", () => {
      if (!m.getSource("toilets"))
        m.addSource("toilets", {
          type: "geojson",
          attribution:
            '<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 48,
        });
      if (!m.getLayer("cluster-circles"))
        m.addLayer({
          id: "cluster-circles",
          type: "circle",
          source: "toilets",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#075f51",
            "circle-radius": 18,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 3,
          },
        });
      if (!m.getLayer("points"))
        m.addLayer({
          id: "points",
          type: "circle",
          source: "toilets",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "match",
              ["get", "state"],
              "open",
              "#16836c",
              "closed",
              "#aa7864",
              "#77938c",
            ],
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2.5,
          },
        });
      if (!m.getLayer("selected"))
        m.addLayer({
          id: "selected",
          type: "circle",
          source: "toilets",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": 14,
            "circle-color": "#075f51",
            "circle-stroke-width": 4,
            "circle-stroke-color": "#cef0bd",
          },
        });
      if (!m.getSource("position"))
        m.addSource("position", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      if (!m.getLayer("precision"))
        m.addLayer({
          id: "precision",
          type: "circle",
          source: "position",
          paint: {
            "circle-color": "#3977e8",
            "circle-opacity": 0.13,
            "circle-radius": ["get", "radius"],
            "circle-stroke-color": "#3977e8",
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0.3,
          },
        });
      if (!m.getLayer("position-dot"))
        m.addLayer({
          id: "position-dot",
          type: "circle",
          source: "position",
          paint: {
            "circle-color": "#3977e8",
            "circle-radius": 7,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 3,
          },
        });
      setReady(true);
      if (!initialized) {
        initialized = true;
        emitBounds();
      }
    });
    m.on("click", "points", (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) latest.current.onSelect(String(id));
    });
    m.on("mouseenter", "points", () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", "points", () => {
      m.getCanvas().style.cursor = "";
    });
    m.on("dragstart", () => latest.current.onManual());
    m.on("zoomstart", (e) => {
      if (e.originalEvent) latest.current.onManual();
    });
    m.on("moveend", emitBounds);
    m.on("idle", () => {
      if (m.getSource(basemapSource)) setBasemapLoading(false);
    });
    m.on("error", (e) => {
      if (
        e.error instanceof maplibregl.AJAXError ||
        /tile|fetch|network|ajax|glyph|sprite/i.test(e.error?.message ?? "")
      ) {
        setTileError(true);
        setBasemapLoading(false);
      }
    });
    return () => {
      observer.disconnect();
      markers.forEach((marker) => {
        marker.remove();
      });
      markers.clear();
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, [reportCamera]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    setBasemapLoading(true);
    setTileError(false);
    try {
      if (basemapAttempt > 0) setReady(false);
      m.setStyle(basemapStyle(p.dark), {
        transformStyle: preserveOverlays,
        diff: basemapAttempt === 0,
      });
    } catch {
      setTileError(true);
      setBasemapLoading(false);
    }
  }, [p.dark, basemapAttempt]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const current = m.getCenter();
    if (
      Math.abs(current.lng - p.camera.center[0]) > 0.000006 ||
      Math.abs(current.lat - p.camera.center[1]) > 0.000006 ||
      Math.abs(m.getZoom() - p.camera.zoom) > 0.006 ||
      Math.abs(m.getBearing() - p.camera.bearing) > 0.006 ||
      Math.abs(m.getPitch() - p.camera.pitch) > 0.006
    ) {
      m.flyTo({ ...p.camera, duration: 800 });
    } else queueMicrotask(reportCamera);
  }, [p.camera, ready, reportCamera]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource("toilets") as maplibregl.GeoJSONSource;
    source.setData({
      type: "FeatureCollection",
      features: p.items.map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lon, t.lat] },
        properties: { id: t.id, state: scheduleState(t, p.now) },
      })),
    });
  }, [p.items, p.now, ready]);
  useEffect(() => {
    if (ready && map.current)
      map.current.setFilter("selected", ["==", ["get", "id"], p.selected ?? ""]);
  }, [p.selected, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const container = holder.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      if (!m.getSource("toilets") || !m.isSourceLoaded("toilets")) return;
      const active = new Set<string>();
      const viewport = container.getBoundingClientRect();
      const overlays = Array.from(
        container
          .closest(".map-panel")
          ?.querySelectorAll(
            ".map-controls, .map-legend, .map-top, .mobile-map-header, .mobile-results-trigger, .maplibregl-ctrl-attrib",
          ) ?? [],
        (element) => element.getBoundingClientRect(),
      );
      for (const feature of m.queryRenderedFeatures({ layers: ["cluster-circles"] })) {
        const props = feature.properties;
        if (!props?.cluster || feature.geometry.type !== "Point") continue;
        const point = m.project(feature.geometry.coordinates as [number, number]);
        const x = point.x + viewport.left;
        const y = point.y + viewport.top;
        if (
          point.x < 22 ||
          point.y < 22 ||
          point.x > viewport.width - 22 ||
          point.y > viewport.height - 22 ||
          overlays.some(
            (rect) =>
              x + 22 > rect.left &&
              x - 22 < rect.right &&
              y + 22 > rect.top &&
              y - 22 < rect.bottom,
          )
        )
          continue;
        const id = String(props.cluster_id);
        if (active.has(id)) continue;
        active.add(id);
        if (!clusters.current.has(id)) {
          const btn = document.createElement("button");
          btn.className = "cluster-label";
          btn.textContent = String(props.point_count_abbreviated);
          btn.setAttribute("aria-label", `放大查看 ${props.point_count_abbreviated} 間廁所`);
          const coords = feature.geometry.coordinates as [number, number];
          btn.onclick = async () => {
            const zoom = await (
              m.getSource("toilets") as maplibregl.GeoJSONSource
            ).getClusterExpansionZoom(Number(id));
            m.easeTo({ center: coords, zoom });
          };
          clusters.current.set(
            id,
            new maplibregl.Marker({ element: btn })
              .setLngLat(feature.geometry.coordinates as [number, number])
              .addTo(m),
          );
        }
        const marker = clusters.current.get(id);
        if (!marker) continue;
        const coordinates = feature.geometry.coordinates as [number, number];
        const previous = marker.getLngLat();
        if (previous.lng !== coordinates[0] || previous.lat !== coordinates[1])
          marker.setLngLat(coordinates);
        const element = marker.getElement();
        const count = String(props.point_count_abbreviated);
        if (element.textContent !== count) {
          element.textContent = count;
          element.setAttribute("aria-label", `放大查看 ${count} 間廁所`);
        }
        marker.getElement().onclick = async () => {
          const zoom = await (
            m.getSource("toilets") as maplibregl.GeoJSONSource
          ).getClusterExpansionZoom(Number(id));
          m.easeTo({
            center:
              feature.geometry.type === "Point"
                ? (feature.geometry.coordinates as [number, number])
                : m.getCenter(),
            zoom,
          });
        };
      }
      for (const [id, marker] of clusters.current)
        if (!active.has(id)) {
          marker.remove();
          clusters.current.delete(id);
        }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const sourceChanged = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId === "toilets") schedule();
    };
    m.on("idle", schedule);
    m.on("moveend", schedule);
    m.on("sourcedata", sourceChanged);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      m.off("idle", schedule);
      m.off("moveend", schedule);
      m.off("sourcedata", sourceChanged);
    };
  }, [ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const update = () => {
      const c = p.position;
      const radius = c
        ? Math.min(
            160,
            Math.max(
              12,
              c.accuracy / ((156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** m.getZoom()),
            ),
          )
        : 0;
      (m.getSource("position") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: c
          ? [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [c.lon, c.lat] },
                properties: { radius },
              },
            ]
          : [],
      });
    };
    update();
    m.on("zoomend", update);
    return () => {
      m.off("zoomend", update);
    };
  }, [p.position, ready]);
  return (
    <TooltipProvider delayDuration={350}>
      <div className="map-stage">
        <section
          className="map-canvas"
          ref={holder}
          aria-label="公廁位置地圖"
          aria-busy={basemapLoading && !failed}
        />
        {failed && (
          <div className="map-fallback">
            <MapIcon size={34} />
            <strong>這個裝置無法顯示互動地圖</strong>
            <p>仍可用下方清單搜尋、查看資訊與導航。</p>
          </div>
        )}
        {tileError && !failed && (
          <div className="map-network-note" role="status">
            <span>底圖暫時無法載入，廁所標記與清單仍可使用。</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBasemapAttempt((attempt) => attempt + 1)}
            >
              重試
            </Button>
          </div>
        )}
        <div className="map-controls">
          <div className="zoom-controls">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label="放大地圖"
                  onClick={() => {
                    p.onManual();
                    map.current?.zoomIn();
                  }}
                >
                  <Plus size={19} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">放大地圖</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label="縮小地圖"
                  onClick={() => {
                    p.onManual();
                    map.current?.zoomOut();
                  }}
                >
                  <Minus size={19} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">縮小地圖</TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                type="button"
                className={`locate-control ${p.locating ? "locating" : ""}`}
                aria-label="定位目前位置"
                disabled={p.locating || !p.locateSupported}
                onClick={p.onLocate}
              >
                <LocateFixed className="size-[24px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">定位目前位置</TooltipContent>
          </Tooltip>
        </div>
        <div className="map-legend">
          <span className="legend-dot open" />
          時段開放 <span className="legend-dot unknown" />
          時間未知 <span className="legend-dot closed" />
          非開放時段
        </div>
        {!ready && !failed && (
          <div className="map-loading">
            <MapPin size={18} />
            地圖載入中
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
