import { useSyncExternalStore } from "react";

const media = matchMedia("(max-width: 760px), (pointer: coarse) and (max-width: 1024px)");
const subscribe = (onChange: () => void) => {
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => media.matches);
}
