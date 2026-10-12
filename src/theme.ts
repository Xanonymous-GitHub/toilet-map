import { useLayoutEffect, useState } from "react";
import { savePreference } from "./storage";

export type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111b18" : "#075f51");
  return dark;
}

export function initializeTheme(theme: Theme) {
  applyTheme(theme);
}

export function useTheme(theme: Theme) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useLayoutEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(applyTheme(theme));
    update();
    savePreference("theme", theme);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  return { dark };
}
