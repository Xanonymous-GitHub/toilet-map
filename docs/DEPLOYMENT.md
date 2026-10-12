# Netlify／Vercel 部署

本版具備正式建置、API adapter、PWA 與平台設定，可直接匯入 GitHub repository 部署。建置不需要 Python、資料庫或 API 私鑰；Python 3.15 工具用於維護資料與驗證。

## 平台設定

| 平台 | 設定 |
| --- | --- |
| Netlify | 匯入 repository，根目錄保留預設；`netlify.toml` 設定 Bun 1.4.3、`bun run build`、`dist/client` 與已壓縮的 Functions |
| Vercel | 匯入 repository；`vercel.json` 設定 Bun 1.4 系列、frozen 安裝、`bun run build`、`dist/client` 與 `/api/v1/*` rewrite |
| Sites | `dist/server/index.js` 的 Worker 內含前端及資料；使用 `.openai/hosting.json` 保留既有專案 |

保留平台預設 HTTPS，定位與 Service Worker 才能運作。請勿將整個專案當成只有靜態 HTML 的網站上傳：公廁 API 需要 Functions／Worker。Netlify 的 API v2 Web handler 路由為 `/api/*`；Vercel 的 Web handler 為 `api/handler.mjs`，rewrite 保留查詢參數。

OSM 完整下載在 Netlify／Vercel 由 API 303 轉導到 `dist/client/downloads/` 的壓縮 JSON 資產，避免超過 Functions 回應大小限制。Sites Worker 使用串流下載。下載不加入 PWA precache。

## 已驗證範圍

- 以 Node 24 執行兩個平台的真實 Web handler，確認城市資料、query、HEAD、錯誤回應與下載轉導；另外驗證 Vercel rewrite 後的路徑復原。
- 最新 Netlify 官方 packager 實際產生 API v2 的 ZIP，確認 `/api/*` 路由、串流模式及壓縮後大小約 2.4 MB；不是只檢查設定文字。
- JS／CSS／HTML／SVG／JSON／manifest 都由維護中的建置工具壓縮；JavaScript AST 驗證沒有註解。開源授權集中於可下載的 `third-party-licenses.json`。
- CSP、地理定位權限、Service Worker 更新與 hashed assets 的快取標頭已設定；底圖允許來自 `tile.openstreetmap.org`。Sites、Netlify 與 Vercel 的 CSP／Referrer-Policy 設定一致並有回歸測試；圖塊請求另外指定 Referer 政策，承受 CDN 覆寫頁面標頭。
- 桌面、手機、深淺色、定位、導航、離線重開與下載失敗回復由瀏覽器驗證。

沒有連線到使用者的 Netlify／Vercel 帳號執行正式部署。以上是建置與平台打包／handler 驗證；部署後還需在實際網域確認下列 smoke checks。

## 部署後檢查

1. 開啟 `/api/v1/regions`，確認 JSON、181 城市及資料版本。
2. 前往釜山／大阪並定位，確認清單、底圖、深色模式、收合側邊欄與導航。
3. 下載 `/api/v1/osm-export?country=JP`，確認會取得完整 JSON。
4. 瀏覽一次後離線重新開啟，確認 App 與最近載入範圍可用；底圖及外部導航需要網路。
5. 在實際手機與部署網域量測載入速度、GPS、安裝及地圖 App 交接。本機軟體 WebGL／固定圖磚的 Lighthouse 結果見 `performance-report.json`，不能當成真實手機與圖磚服務的效能承諾。

底圖使用 OpenStreetMap 官方 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`，不需要 API key。保留平台設定中的 `tile.openstreetmap.org` CSP 許可、HTTP 快取與來源署名，遵守 [官方圖塊使用政策](https://operations.osmfoundation.org/policies/tiles/)。外部服務失敗時，廁所圖層與清單仍可使用，並可手動重試；App 不預下載、代理或離線保存底圖。

頁面的 `Referrer-Policy: same-origin` 會讓跨來源圖塊缺少 Referer。`transformMapRequest` 對官方圖塊指定 `strict-origin-when-cross-origin`，只送網站來源；`refreshExpiredTiles: true` 保留 MapLibre 的 Fetch 路徑與快取標頭，避免使用不套用此設定的 Image 路徑。即使 CDN 覆寫頁面標頭，圖塊仍可使用正確政策。署名和來源都保留官方服務，沒有換 host 或偽造識別。

## CDN 與 Worker 安全政策

Worker script 的回應 CSP 會限制 Worker 自己的連線；只更新 HTML 的 CSP 不夠。`vite.config.ts` 將 `server/headers.ts` 中 CSP 的 SHA-256 版本加入地圖 Worker 檔名，並保留內容 hash。政策變更會更新 Worker URL、引用它的 MapView chunk 與 PWA precache，避免長期快取帶著上一版允許的底圖 host。靜態資產仍保留一年 immutable 快取。

2026-10-12 在 `toilet-map.xcc.tw` 實際重現：頁面允許 OpenFreeMap，Cloudflare HIT 的舊 Worker 卻只允許 `tile.openstreetmap.org`，桌面與手機的向量圖塊因此被 CSP 阻擋。更換 Worker URL 後，新資產取得正確標頭，不需要清空使用者保存的城市、設定或收藏。部署後應同時檢查 HTML 與實際 Worker 資產的 `Content-Security-Policy`；如自行修改 CDN 標頭規則，需同步更新版本或清除對應 CDN 快取。
