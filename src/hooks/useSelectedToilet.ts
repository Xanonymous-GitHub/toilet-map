import { useEffect, useState } from "react";
import { fetchToilet, ToiletLookupError } from "../api";
import type { Toilet } from "../core";
import { readToilet, saveToilet } from "../storage";

export function useSelectedToilet(id: string | null, candidate: Toilet | undefined) {
  const [result, setResult] = useState<Toilet | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!id) {
      setResult(null);
      return;
    }
    if (candidate) {
      setResult(candidate);
      void saveToilet(candidate).catch(() => {});
      return;
    }
    const controller = new AbortController();
    let active = true;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    async function load() {
      const cached = await readToilet(id as string).catch(() => null);
      if (!active) return;
      if (cached) setResult(cached);
      try {
        const toilet = await fetchToilet(id as string, signal);
        if (!active) return;
        setResult(toilet);
        void saveToilet(toilet).catch(() => {});
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ToiletLookupError && failure.status === 404) {
          setResult(null);
          setError("這間廁所已不在資料中，可從地圖查看附近其他廁所。");
        } else if (!cached) {
          setError("無法載入這間廁所，請連線後重試。");
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, candidate]);
  return { detail: candidate ?? (result?.id === id ? result : null), error };
}
