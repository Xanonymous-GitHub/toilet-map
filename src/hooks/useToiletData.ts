import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRegion } from "../api";
import { type Bbox, type Envelope, REGIONS, type Region } from "../core";
import { containsBounds, paddedBounds, searchableBounds } from "../regions";
import { readRegion, saveRegion } from "../storage";

export function useToiletData(
  region: Region,
  bounds: Bbox | null,
  notify: (message: string) => void,
) {
  const [data, setData] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [area, setArea] = useState({ region, box: REGIONS[region].bounds });
  const box = area.region === region ? area.box : REGIONS[region].bounds;
  const request = useMemo(() => ({ region, revision, box }), [region, revision, box]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!bounds || !searchableBounds(bounds) || containsBounds(box, bounds)) return;
    const timer = setTimeout(() => setArea({ region, box: paddedBounds(bounds) }), 450);
    return () => clearTimeout(timer);
  }, [region, bounds, box]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 30_000);

    async function load() {
      try {
        const next = await fetchRegion(
          request.region,
          controller.signal,
          fetch,
          request.revision ? "reload" : "default",
          request.box,
        );
        if (!active) return;
        setData(next);
        // Offline storage failure must not hide a successfully loaded city.
        void saveRegion(request.region, next).catch(() => {});
      } catch {
        if (!active) return;
        try {
          const cached = await readRegion(request.region);
          if (!active) return;
          if (cached) {
            setData({ ...cached, offline: true });
            notify("目前使用最近下載的範圍，開放時間會重新計算。");
          } else {
            setError("暫時無法取得這個城市的資料。請連線後重試。");
          }
        } catch {
          if (active) setError("無法讀取資料，請連線後重試。");
        }
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [request, notify]);

  return { data: data?.region === region ? data : null, loading, error, refresh };
}
