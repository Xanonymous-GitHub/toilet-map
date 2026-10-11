import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRegion } from "../api";
import type { Envelope, Region } from "../core";
import { readRegion, saveRegion } from "../storage";

export function useToiletData(region: Region, notify: (message: string) => void) {
  const [data, setData] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const request = useMemo(() => ({ region, revision }), [region, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    const timeout = setTimeout(() => controller.abort(), 15_000);

    async function load() {
      try {
        const next = await fetchRegion(
          request.region,
          controller.signal,
          fetch,
          request.revision ? "reload" : "default",
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
            notify("目前使用已下載資料，開放時間會重新計算。");
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

  return { data, loading, error, refresh };
}
