import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "./components/ui/tooltip";
import { initializeTheme } from "./theme";
import "./ui.css";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("App root element is missing");
initializeTheme();
createRoot(root).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={350}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
