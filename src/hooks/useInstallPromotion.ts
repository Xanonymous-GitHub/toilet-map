import { useCallback, useEffect, useState } from "react";
import { readPreference, savePreference } from "../storage";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
export function useInstallPromotion() {
  const [visible, setVisible] = useState(
    () =>
      !matchMedia("(display-mode: standalone)").matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone &&
      !readPreference("install-promotion-dismissed", false, isBoolean),
  );
  const [held, setHeld] = useState(false);
  const dismiss = useCallback(() => {
    setVisible(false);
    savePreference("install-promotion-dismissed", true);
  }, []);
  useEffect(() => {
    if (!visible || held) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [visible, held, dismiss]);
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    const update = () => {
      if (media.matches) dismiss();
    };
    media.addEventListener("change", update);
    window.addEventListener("appinstalled", dismiss);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("appinstalled", dismiss);
    };
  }, [dismiss]);
  return { visible, setHeld, dismiss };
}
