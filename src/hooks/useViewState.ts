import { useCallback, useEffect, useRef, useState } from "react";
import { loadView } from "../browser-state";
import { REGIONS } from "../regions";
import { savePreference } from "../storage";
import { normalizeView, type ViewState, viewUrl } from "../view-state";

type Patch = Partial<ViewState> | ((previous: ViewState) => Partial<ViewState>);
function shareReferences(next: ViewState, previous: ViewState) {
  for (const key of ["camera", "filters", "sharedSaved"] as const)
    if (JSON.stringify(next[key]) === JSON.stringify(previous[key]))
      Object.assign(next, { [key]: previous[key] });
  return next;
}

export function useViewState(initial: ViewState, saved: Set<string>, cameraExplicit: boolean) {
  const [view, setView] = useState(initial);
  const [navigation, setNavigation] = useState({
    revision: 0,
    cameraExplicit,
    cameraChanged: false,
  });
  const latest = useRef(view);
  const bookmarks = useRef(saved);
  bookmarks.current = saved;
  const lastUrl = useRef("");
  const commit = useCallback(
    (next: ViewState, mode: "push" | "replace", ownSaved = bookmarks.current) => {
      savePreference("view-state", next);
      savePreference("region", next.region);
      savePreference(`country-${REGIONS[next.region].country}`, next.region);
      savePreference("sidebar-open", next.sidebarOpen);
      const url = viewUrl(new URL(location.href), next, ownSaved).href;
      if (url === location.href) {
        lastUrl.current = url;
        return;
      }
      try {
        history[mode === "push" ? "pushState" : "replaceState"]({ relief: 1 }, "", url);
        lastUrl.current = url;
      } catch {
        // Browser-local state remains usable if history updates are unavailable.
      }
    },
    [],
  );
  const update = useCallback(
    (patch: Patch, mode: "push" | "replace" = "push") => {
      const next = shareReferences(
        normalizeView({
          ...latest.current,
          ...(typeof patch === "function" ? patch(latest.current) : patch),
        }),
        latest.current,
      );
      if (JSON.stringify(next) === JSON.stringify(latest.current)) return;
      latest.current = next;
      commit(next, mode);
      setView(next);
    },
    [commit],
  );
  useEffect(() => {
    commit(latest.current, "replace");
    const restore = () => {
      if (lastUrl.current === location.href) return;
      const loaded = loadView(new URL(location.href), [...bookmarks.current]);
      const cameraChanged =
        loaded.state.region !== latest.current.region ||
        JSON.stringify(loaded.state.camera) !== JSON.stringify(latest.current.camera);
      loaded.state = shareReferences(loaded.state, latest.current);
      // Reissue the camera command when navigation restores a view at the same coordinates.
      loaded.state.camera = { ...loaded.state.camera };
      latest.current = loaded.state;
      commit(loaded.state, "replace");
      setView(loaded.state);
      setNavigation((previous) => ({
        revision: previous.revision + 1,
        cameraExplicit: loaded.cameraExplicit,
        cameraChanged,
      }));
    };
    addEventListener("popstate", restore);
    addEventListener("hashchange", restore);
    return () => {
      removeEventListener("popstate", restore);
      removeEventListener("hashchange", restore);
    };
  }, [commit]);
  useEffect(() => {
    if (view.filters.saved) commit(latest.current, "replace", saved);
  }, [saved, view.filters.saved, commit]);
  const shareUrl = useCallback(
    () => viewUrl(new URL(location.href), latest.current, bookmarks.current).href,
    [],
  );
  return { view, update, navigation, shareUrl };
}
