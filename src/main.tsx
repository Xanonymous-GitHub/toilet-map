import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadView } from "./browser-state";
import { readPreference } from "./storage";
import { initializeTheme } from "./theme";
import { isToiletId } from "./view-state";
import "./ui.css";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("App root element is missing");
const saved = readPreference(
  "saved",
  [],
  (value): value is string[] => Array.isArray(value) && value.every(isToiletId),
);
const initialView = loadView(new URL(location.href), saved);
initializeTheme(initialView.state.theme);
createRoot(root).render(
  <React.StrictMode>
    <App initialView={initialView} />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
