# 工程品質與工具鏈

專案以 Bun 管理 JavaScript 安裝、執行與測試。Python 工具由 uv 管理，Ruff 負責 lint 與格式。前端使用 Vite／Rolldown；shadcn UI 官方 CLI 產生的元件採用 Radix、Tailwind 4 與官方 cn 合併引擎。

## 版本策略

JavaScript 直接依賴寫入精確版本；Python 開發依賴在 `pyproject.toml` 宣告相容範圍，實際版本由 `uv.lock` 鎖定。Bun 1.4.3 保存在 `.bun-version`，Python 最低版本為 3.15，uv 為 0.13.0。提交 `bun.lock`／`uv.lock`，CI 使用 frozen／locked 安裝。

`bun run deps:check` 比對 JavaScript registry 的 `latest`、PyPI 穩定版及 Bun GitHub 最新 release；Python 比較的是鎖檔中的直接開發依賴版本，不解析版本範圍為版本號，也不檢查間接依賴。結果寫入 `.cache/dependency-versions.json`，查證紀錄複製至 `docs/dependency-versions.json`。報告的 `pinned` 欄位表示此次比較的宣告／鎖定版本。

間接依賴由上游套件的相容範圍解析與鎖定，避免以全域 overrides 強行替換不相容的大版。CI 與部署使用 frozen／locked 安裝，讓「最新版」與「可重現」在查證當下同時成立。

## 必要關卡

```bash
bun install --frozen-lockfile
uv sync --locked
bun run verify
```

`verify` 會先建置供 API／PWA 測試使用的資產，再跑 Biome、Ruff、主程式與 Service Worker 的 TypeScript 檢查，最後以 `bun run test` 執行 43 項 Bun 與 4 項 Python 標準庫 unittest 測試。獨立 `typecheck`、`check`、`test` 需要先產生 ignored `server/*.generated.ts`，乾淨 checkout 先執行 `build` 或直接使用 `verify`。`test:browser` 另驗證實際建置後的 UI；可設定 `RELIEF_BASE_URL` 與預覽端的 `RELIEF_PORT`。

Biome recommended 規則與 React／Playwright／types／test domains 保留啟用，warnings 會使檢查失敗。僅 CSS 檔案的 `noDescendingSpecificity` 例外：該規則不理解不同元件的 DOM 邊界，會將無法同時匹配同一元素的 selector 視為衝突。元件語意、按鈕 type、事件操作與 hook dependencies 均修正後通過，沒有以整體關閉 lint 取代修正。

## 建置大小與瀏覽器回歸

地圖元件使用 React lazy／Suspense，入口 chunk 約 277 KB（gzip 90 KB），共用 chunk 約 53 KB（gzip 21 KB），首屏 JavaScript 合計約 330 KB（gzip 110 KB）；MapView 約 46 KB（gzip 17 KB），MapLibre 約 1,040 KB（gzip 283 KB）。MapLibre 發布的是單一預打包 ESM 模組，不能用模組層級的 code splitting 再切小；Vite 的一般提示門檻配合此模組調整為 1,100 KB，另由建置 plugin 強制每個應用程式 chunk 不超過 500,000 bytes、MapLibre 不超過 1,100,000 bytes，超標直接失敗，並非整體忽略大小問題。Bun 測試另確認所有延後載入 chunks 都包含在離線 shell。

地圖模組下載失敗時顯示 fallback，不會使清單與詳細資訊失效。瀏覽器測試等待城市飛行完成後，才操作手動縮放或拖曳，避免把中途的跨國 viewport 誤當成目的地。69 項檢查記錄 console warnings；只允許 Chromium 軟體 WebGL 截圖讀回像素的 `GPU stall due to ReadPixels` 驅動診斷，其他警告使測試失敗。離線與刻意阻斷模組的網路錯誤保留在報告中。

## 本輪整理

- `useGeolocation` 管理定位請求與 watcher：晚到的請求結果、手動切換城市、手動縮放及元件卸載會使舊回呼失效；頁面背景時停止 watcher。
- `useToiletData` 管理載入、重新查詢、取消、逾時及 IndexedDB fallback；快取讀取完成後也檢查請求是否仍有效。
- `fetchRegion` 保證資料版本、筆數、游標與 ID 一致；拒絕截斷、重複與循環分頁。
- `ToiletDetail`、`InformationModal`、`ToiletStatus` 分離 UI；說明與詳細資訊使用 shadcn Dialog／Sheet 處理焦點與 Escape。
- 收藏偏好先驗證形狀，損壞的 localStorage 回到預設值。偏好寫入移到 effect，保持 React state updater 無副作用。
- API 明確拒絕空字串／非標準分頁參數，HEAD 不回傳 body，405 回應提供 Allow。
- MapLibre 6 的 Worker 明確作為 Vite 資產打包、使用正確 JavaScript MIME 並納入離線 shell；驗證實際廁所聚合標記可顯示與點選。
- Service Worker 改為可 lint、可 typecheck 的獨立原始碼；Rolldown 打包時注入資產清單，快取名稱依內容 hash 產生。
- Python importer 不再依賴其他專案的絕對路徑；保留原始資料擷取時間，重新下載時不沿用未確認的來源更新日期。

本輪驗證結果見 `VALIDATION.md`。

## 全國覆蓋擴充

保留既有 Bun／Biome／Ruff 鎖版工具鏈。城市定義使用共享 `data/regions.json`，匯入器與前後端使用同一個中心與 bounds。API 逐一驗證 181 城市與周邊都存在實際候選、筆數對帳及國家座標一致。

Worker 以 gzip／base64 保存空間格，每次僅解壓查詢交集，LRU 上限 8,000 筆，同格併發解壓共用 promise；不在啟動時 JSON.parse 全國 23 MB 資料。OSM 原始與衍生資料以串流提供，保留 ODbL 來源追溯。

定位會辨識非首都與離島的附近城市。選擇城市後，舊 flyTo 的 moveend 會被忽略；手動移動才解除目標保護。地圖超出已載入區域後以 450 ms debounce 請求新 bbox，取消舊請求；縮放到過大範圍時引導放大地圖。

時段 parser 遇到 OSM 星期、假日或季節條件會保守標示未知，不把 Mo–Fr 推定成每日開放。官方精確 `24시`／`상시` 可辨識為全天。

地方資料正規化排除 13 筆無／錯座標、合併全北 48 筆同來源重複；32 組時段衝突與 5 組資格衝突保留未知。原有官方 importer 與擴充 importer 重跑均保留相同 45,867 筆、來源、coverage 及資料版本；沒有 ignored 原始檔的乾淨 checkout 也產生完全相同 bytes。公開下載 metadata、SHA-256 與欄位稽核保存在研究目錄。

OSM 圖磚恢復載入後會清除舊網路警示，避免離線期間的失敗訊息一直留在已恢復的底圖上。

## 外觀、效能與部署建置

TypeScript 與建置 target 使用 ESNext，Python 為 3.15／Ruff py315。主程式只載入必要的 shadcn primitives；工具提示隨地圖載入，說明與詳細資訊延後載入。外觀選單採用 shadcn NativeSelect，避免把完整選單程式庫放進首屏。先渲染 12 張卡片，再由「顯示更多」追加；完整載入資料、篩選與地圖點位不截斷。時區 formatter 與相同時間的分鐘值共用；地圖聚合只在資料與視野變化後更新，避免每幀查詢。

Rolldown／Vite、Lightning CSS、cssnano、SVGO 與 html-minifier-terser 負責壓縮，JS output comments=false。Netlify 的 route scanner 尚不接受部分 template literal 設定，以維護中的 Terser 設定雙引號輸出；不使用文字替換清除註解。`rollup-plugin-license` 保存獨立授權 JSON。正式資產的 JS AST、CSS、JSON byte 格式與授權檔由測試檢查。

Netlify 最新官方 packager 的 TypeScript parser 尚未相容專案使用的 TypeScript 7，因此打包驗證工具使用獨立的 tooling lockfile；正式專案仍使用 TypeScript 7，不以全域 overrides 強制替換間接依賴。平台 adapter 共用 API，Node 24 尚未提供 Uint8Array.fromBase64 時使用標準 atob fallback。詳見 [部署說明](DEPLOYMENT.md)。

## 手機畫面整理

手機（含 1024px 以下的觸控橫向畫面）以完整地圖為主，常駐搜尋、篩選入口、附近清單與定位。國家／城市／篩選／外觀／來源／安裝與圖例集中在按需展開的 shadcn Sheet；全國收錄與載入統計不再固定占用底部空間。桌面保留可收合側欄。

手機清單使用獨立的標題與捲動區，移除固定 256px 地圖起點與 32dvh 高度。關閉面板會回到入口焦點，查看詳細資訊或說明時先關閉舊面板；搜尋 Enter 會處理預設按鍵動作與輸入法組字，避免新面板被 Enter 立即關閉。地圖始終維持同一個實例，展開清單不會重新建立 WebGL。

`MobilePanel` 延後載入並重用 shadcn Sheet。手機面板不使用位移動畫，卡片直接顯示，避免 content-visibility 與進場位置造成暫時空白。定位與清單入口至少 44px，支援動態 viewport 與安全區；圖磚著作權仍保留。

高密度螢幕的 MapLibre canvas 上限為 2x；3x 手機由每個 CSS 像素繪製 9 個像素降至 4 個，UI 文字與 DOM 控制仍維持裝置解析度。尺寸變化時透過 MapLibre API 更新，避免重建地圖或清除位置。

## 畫面狀態與分享

`view-state.ts` 定義版本、正規化與 URL 往返；`useViewState` 同步 localStorage、fragment 與 popstate／hashchange，使用結構共用避免捲動或面板操作重新傳送全城 GeoJSON。語意操作建立 history，地圖移動與輸入／捲動取代目前紀錄；捲動寫入以 120ms debounce，pagehide 時補上最新位置。

`useSelectedToilet` 依 ID 個別載入、驗證快取並處理取消與 404。IndexedDB v2 保留 v1 的地區 store，新增廁所 store。`useScrollRestoration` 共用四種捲動還原，透過 shadcn 的 onOpenAutoFocus 避免 Portal 與預設焦點把已還原內容捲回頂部。React 19.3 的 useEffectEvent 讓鍵盤監聽讀到最新分享狀態；Escape 只關閉最上層視窗。

8 項狀態格式與 3 項直接查詢測試補上 160 種篩選／面板往返組合、長收藏 fragment、舊網址、無效參數及回應驗證；另有 32 項實際瀏覽器檢查驗證行為，與原本 69 項回歸共同在 CI 執行。
