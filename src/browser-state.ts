import { isRegion } from "./regions";
import { readPreference } from "./storage";
import { defaultView, isTheme, normalizeView, parseViewUrl, type ViewState } from "./view-state";

export function loadView(
  url = new URL(location.href),
  ownSaved: string[] = [],
): { state: ViewState; cameraExplicit: boolean } {
  const region = readPreference("region", "tokyo", isRegion);
  const legacy = {
    ...defaultView(region),
    theme: readPreference("theme", "system", isTheme),
    sidebarOpen: readPreference("sidebar-open", true, (v): v is boolean => typeof v === "boolean"),
  };
  const stored = readPreference("view-state", legacy, (value): value is ViewState =>
    Boolean(value && typeof value === "object" && "version" in value && value.version === 1),
  );
  const local = normalizeView(stored, legacy);
  const shared = parseViewUrl(url);
  if (!shared) return { state: local, cameraExplicit: true };
  const state = shared.state;
  state.lastViewed = local.lastViewed;
  if (
    state.sharedSaved &&
    JSON.stringify(state.sharedSaved) === JSON.stringify([...new Set(ownSaved)].sort())
  )
    state.sharedSaved = null;
  return { state, cameraExplicit: shared.cameraExplicit };
}
