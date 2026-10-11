import { useCallback, useEffect, useRef, useState } from "react";

export type Position = { lat: number; lon: number; accuracy: number };

export function useGeolocation(
  onPosition: (position: Position) => void,
  notify: (message: string) => void,
) {
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [following, setFollowing] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const updateVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      mounted.current = false;
      requestId.current += 1;
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const receive = useCallback(
    (result: GeolocationPosition) => {
      const next = {
        lat: result.coords.latitude,
        lon: result.coords.longitude,
        accuracy: result.coords.accuracy,
      };
      setPosition(next);
      setLocating(false);
      onPosition(next);
    },
    [onPosition],
  );

  const stopFollowing = useCallback(() => {
    requestId.current += 1;
    setFollowing(false);
    setLocating(false);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      notify("此瀏覽器不支援定位，請選城市或移動地圖。");
      return;
    }
    const currentRequest = ++requestId.current;
    setLocating(true);
    setFollowing(false);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        if (!mounted.current || currentRequest !== requestId.current) return;
        receive(result);
        setFollowing(true);
      },
      (error) => {
        if (!mounted.current || currentRequest !== requestId.current) return;
        setLocating(false);
        notify(
          error.code === 1
            ? "定位權限未開啟。可在瀏覽器設定允許定位，或直接搜尋城市。"
            : error.code === 3
              ? "定位逾時，請到訊號較好的地方重試；也可手動選城市。"
              : "裝置暫時無法定位，請手動選城市或移動地圖。",
        );
      },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 },
    );
  }, [notify, receive]);

  useEffect(() => {
    if (!following || !visible || !navigator.geolocation) return;
    let active = true;
    const watchRequest = requestId.current;
    const id = navigator.geolocation.watchPosition(
      (result) => {
        if (active && requestId.current === watchRequest) receive(result);
      },
      (error) => {
        if (!active || requestId.current !== watchRequest) return;
        if (error.code === 1) {
          setFollowing(false);
          notify("定位權限已關閉，已停止位置追蹤。");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(id);
    };
  }, [following, visible, receive, notify]);

  return { position, locating, locate, stopFollowing };
}
