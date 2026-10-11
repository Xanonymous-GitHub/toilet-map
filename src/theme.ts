import { useEffect, useState } from "react";
import { readPreference, savePreference } from "./storage";

export type Theme = "system" | "light" | "dark";
const isTheme = (value: unknown): value is Theme =>
  value === "system" || value === "light" || value === "dark";
const storedTheme = () => readPreference<Theme>("theme", "system", isTheme);

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111b18" : "#075f51");
  return dark;
}

export function initializeTheme() {
  applyTheme(storedTheme());
}

export function useTheme() {
  const [theme, setPreference] = useState<Theme>(storedTheme);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(applyTheme(theme));
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  const setTheme = (value: Theme) => {
    savePreference("theme", value);
    setDark(applyTheme(value));
    setPreference(value);
  };
  return { theme, setTheme, dark };
}
