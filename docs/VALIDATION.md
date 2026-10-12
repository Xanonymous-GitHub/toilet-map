# UI、部署與全國覆蓋驗證紀錄

本輪驗證日期：2026-10-12。從 GitHub main `033fe3c` 追查正式網域 `toilet-map.xcc.tw` 的黑屏，修正 Worker 的 CDN 安全標頭快取；保留既有畫面保存與分享，資料仍使用 2026-10-11 已查證快照，未改變 181 城市的覆蓋。

## 工具鏈與建置

- Bun 1.4.3、Python 3.15.0 final、uv 0.13.0、TypeScript 7.0.2、Vite 8.3.4、Biome 2.5.15、Ruff 0.17.0、Playwright 1.63.0、Chromium 154。
- TypeScript／前端／Worker target 為 ESNext，Python 最低版本 3.15，Ruff target py315。32 項直接套件／工具均向官方查證為最新穩定版，見 `dependency-versions.json`；沒有依賴刷新 workflow。
- `bun run verify` 通過正式建置、大小預算、Biome、Ruff、strict 型別、42 項 Bun 與 4 項 Python 測試。API 逐一確認 181 城市、完整分頁、範圍與國家、HEAD／405、非法參數、來源授權與完整匯出。
- 正式 JS 的 AST 沒有註解，CSS 不含註解，JSON／manifest 等於 compact JSON.stringify；HTML／SVG 亦壓縮。開源聲明另存 `third-party-licenses.json`，可從使用說明開啟。
- 入口 chunk 約 294 KB（gzip 95 KB），另有首屏共用 chunk 約 53 KB（gzip 21 KB）；首屏 JavaScript 合計約 346 KB（gzip 116 KB）。延後載入 MapView 約 48 KB（gzip 17 KB），MapLibre 約 1,040 KB（gzip 283 KB），地圖 Worker 約 507 KB。應用程式與 MapLibre 各有強制建置預算，所有延後載入 chunks 都納入離線 shell。
- 正式建置由 Vite／Rolldown、Lightning CSS、cssnano、SVGO 與 html-minifier-terser 壓縮；Netlify Function 使用 Terser 設定解決官方 route scanner 的字串語法限制。

## 底圖服務與失敗恢復

配色改用 Bright 淺色底圖與經調色的 Dark：水域藍、植被綠、主幹道金色、鐵路紫色；深色建築與街道提高明度，地名使用亮色與暗描邊。保留供應商的幾何、縮放插值、標籤內容與來源署名。

不再請求 `tile.openstreetmap.org`。底圖使用 OpenFreeMap 的 Bright／Dark 向量樣式，深色地名提高對比；保留 OSM／OpenMapTiles 署名。廁所與定位圖層先在本機空白樣式初始化，底圖請求有 15 秒 timeout 和切換時取消舊請求；樣式切換保留資料與選取，不額外發出範圍查詢。HTTP 快取由瀏覽器管理，PWA 不快取、預抓或代理底圖，正式網站直接向供應商請求。

正式網域的 HTML 已允許 OpenFreeMap，但 `/assets/maplibre-gl-worker-CekbQLRq.js` 的 Cloudflare HIT 回應仍帶著只允許 `tile.openstreetmap.org` 的舊 CSP；實測當時 `Age: 59045`。原生 Chromium 可下載樣式／TileJSON／sprites，Worker 的向量圖塊則全數被安全政策阻擋。對照實驗僅替換 Worker 回應的 CSP，所有圖塊即成功載入，確認根因。修正 `a51cc46` 將 CSP 的 SHA-256 版本加入 Worker 檔名；新路徑的 Cloudflare HIT 回應也保有正確權限，PWA precache 與引用 chunk 同步更新。

底圖專項本機與正式網域各 13 項檢查通過：10 項涵蓋樣式 403、部分圖塊失敗、手動重試、鏡頭／查看紀錄保存、快速外觀切換，以及舊 Worker CSP 黑屏與新政策恢復；另 3 項驗證東京桌面明暗和釜山手機的真實樣式、向量圖塊、glyphs、sprites 與署名。真實服務階段由 Chromium 原生網路請求，經環境代理並信任提供的 CA，保留 TLS 驗證，不攔截或替換底圖 bytes；等待 MapLibre idle 後擷取截圖。本輪本機合計 114 項瀏覽器檢查，CI 執行 111 項固定底圖檢查。

服務規範與整合來源：[OSMF 圖塊政策](https://operations.osmfoundation.org/policies/tiles/)、[OpenFreeMap 官方說明](https://openfreemap.org/)、[MapLibre 整合指南](https://openfreemap.org/quick_start/)。

## 平台與瀏覽器

Netlify 最新官方 packager 實際打包出 API v2 Function 與 `/api/*` 路由，ZIP 約 2.4 MB。兩個平台的 Web handler 在 Node 24 執行通過，包含釜山、HEAD、非法國家、下載 303 與 Vercel rewrite。報告為 `deployment-report.json`。沒有在使用者的 Netlify／Vercel 帳號正式部署；匯入 repository 即可使用已提交的設定，見 [DEPLOYMENT.md](DEPLOYMENT.md)。

Chromium 69 項檢查涵蓋桌面 1440×1000 與手機 390×844，新增 320×568、375×667、430×932、393×480 和觸控橫向 844×390。確認完整地圖、至少 60% 無控制元件的垂直空間、44px 以上主要觸控入口、不重疊定位與清單、首張卡片完整可見，以及設定面板最底部的操作可捲動到達。

功能回歸包含深淺色與跟隨系統、偏好重開、桌面側欄收合、底部控制、安裝提醒自動收起、聚合點選、搜尋與 Enter／空結果、來源 modal 的名稱與鍵盤焦點、詳細資訊、導航、收藏、GPS 拒絕／晚到回呼、非首都與離島切換、拖曳新範圍、桌面與手機離線重開、地圖 chunk 失敗回復。詳細資訊／說明先關閉舊面板，關閉後回到手機入口焦點。

本輪完整固定向量底圖報告為 `browser-fixture-report.json`。固定底圖使用供應商非文字樣式圖層與單一真實圖塊的 water 圖層；API、資料、MapLibre、Worker、PWA 和定位回呼均為正式建置。無未處理錯誤或應用程式警告。console 保留刻意離線／阻斷下載造成的網路錯誤。`mobile-live-report.json` 與 `browser-report.json` 保留前幾輪 OSM raster 底圖的歷史檢查，不能代表本輪向量底圖。

新增 32 項狀態／分享檢查全部通過，報告為 `state-browser-report.json`。包含原生分享與取消、剪貼簿／手動選取 fallback、跨接收者網址優先、獨立收藏清單、不自動請求 GPS、重新整理與無參數重開、上一頁／下一頁、舊 IndexedDB 升級、離線廁所、非首都 ID-only 連結、失效廁所與無效／儲存受限的還原，以及四種捲動位置與手機旋轉。上述合計 101 項操作與狀態檢查，另有 8 項底圖失敗／恢復 CI 檢查。

這些檢查是 Chromium 的手機尺寸與觸控模擬，並非已完成 iOS／Android 實機驗證。

## Lighthouse

以下效能數據保留前輪 `f19f899` 的測量基準，本輪底圖修正未重新量測 Lighthouse，不宣稱本輪已達效能目標。

`bun run test:performance` 使用 Lighthouse 13.5.0、冷啟動 browser profiles、固定圖磚、gzip 預覽、Chromium 軟體 WebGL，以及標準手機／桌面模擬節流。可重跑的程式為 `scripts/performance-qa.py`，完整 JSON／HTML 在 `test-results/`，摘要為 `performance-report.json`。

| 模式 | Performance | Accessibility | Best practices | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| mobile | 47 | 100 | 100 | 4.59 s | 3620 ms | 0 |
| desktop | 65 | 100 | 100 | 0.61 s | 1345 ms | 0 |

首屏移除同步側邊欄量測；地圖在空閒時初始化，清單首批渲染 12 張卡片而保留完整資料。手機控制面板、工具提示、說明與詳細資訊延後載入，外觀使用 shadcn 原生選單。時區時計共用、聚合不再每幀查詢，移除多餘初始 flyTo；沒有為取得分數停用地圖或縮減來源覆蓋。

無障礙、最佳實務與 CLS 通過，但前輪手機軟體 WebGL 的 LCP／TBT 均未達目標；不將此基準描述為已通過效能指標。完整地圖比原本 32dvh 視窗需要更多繪製，CPU profile 仍顯示 MapLibre／軟體 WebGL 的同步工作是主要成本。2x canvas 上限減少 3x 裝置的 GPU 繪製量，但不保證 Lighthouse 分數提高。本機結果不能當成真實手機已通過 Core Web Vitals 的證明；部署後需在實際手機、圖磚供應商與 CDN 下量測。Lighthouse 的頁面 transferBytes 不涵蓋所有 Service Worker 背景 precache 請求，不將它當成完整首次下載量。

## 資料驗證

| 來源 | 原始筆數 | 有效唯一來源紀錄 | API 候選筆數 |
| --- | ---: | ---: | ---: |
| 東京江東區 | 192 | 192 | 192 |
| 首爾 | 4,455 | 4,455 | 4,455 |
| 日本全國 OSM | 32,264 | 32,264 | 31,046 |
| 韓國全國 OSM | 5,406 | 5,406 | 5,374 |
| 釜山 갈맷길 | 197 | 197 | 197 |
| 仁川 미추홀구 | 72 | 72 | 72 |
| 濟州市 | 503 | 490 | 490 |
| 全北特別自治道 | 2,839 | 2,791 | 2,791 |
| 合計 | 45,928 | 45,867 | 44,617 |

日本候選 31,238 筆、韓國 13,379 筆；排除 1,250 筆明示使用限制。濟州排除 12 筆缺座標及 1 筆錯誤緯度；全北合併 48 筆同來源重複，32 組時段與 5 組資格衝突保留未知。OSM way／relation 使用幾何中心，未推定為入口。

日本 114、韓國 67 個快捷範圍均有候選，包括日本全部 20 個政令指定都市。全國來源包含選單外鄉村與離島；城市 bounds 是會重疊的矩形，不是行政界線，城市筆數不能加總。跨來源可能指向同一實體，不把紀錄數當作獨立設施數。更新日、授權、各城市筆數與官方下載限制見 [COVERAGE.md](COVERAGE.md)。

未知的免費、設備、使用資格及複雜時段保持未知。開放狀態依官方或 OSM 時段推估，沒有現場即時查核來源。


## 範圍限制

本輪在 Linux／受信任 CA 代理環境驗證。真實圖磚經 CA 驗證橋接器，不關閉 TLS 驗證；離線測試停用橋接器並使用 browser offline。字型使用裝置系統字型，沒有 Google Fonts 請求。

手機 viewport 與模擬座標不代表已在真實 iPhone／Android 確認 GPS 精度、安裝與外部 App 交接。導航 URL 格式已驗證，OS 如何開啟 App 仍取決於安裝與預設設定。已瀏覽最近範圍可離線重開，底圖與外部導航需要網路。沒有每日背景資料更新排程。
