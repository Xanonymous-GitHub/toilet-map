# UI、部署與全國覆蓋驗證紀錄

本輪驗證日期：2026-10-11（UTC）。從 GitHub 最新 main `84ce447` 開始修正；資料仍使用 2026-10-11 已查證快照，未重新下載或改變 181 城市的覆蓋。

## 工具鏈與建置

- Bun 1.4.3、Python 3.15.0 final、uv 0.13.0、TypeScript 7.0.2、Vite 8.3.4、Biome 2.5.15、Ruff 0.17.0、Playwright 1.63.0、Chromium 154。
- TypeScript／前端／Worker target 為 ESNext，Python 最低版本 3.15，Ruff target py315。32 項直接套件／工具均向官方查證為最新穩定版，見 `dependency-versions.json`；沒有依賴刷新 workflow。
- `bun run verify` 通過正式建置、大小預算、Biome、Ruff、strict 型別、27 項 Bun 與 4 項 Python 測試。API 逐一確認 181 城市、完整分頁、範圍與國家、HEAD／405、非法參數、來源授權與完整匯出。
- 正式 JS 的 AST 沒有註解，CSS 不含註解，JSON／manifest 等於 compact JSON.stringify；HTML／SVG 亦壓縮。開源聲明另存 `third-party-licenses.json`，可從使用說明開啟。
- 初始程式約 277 KB（gzip 90 KB），延後載入 MapView 約 46 KB（gzip 17 KB），MapLibre 約 1,040 KB（gzip 283 KB），地圖 Worker 約 507 KB。應用程式與 MapLibre 各有強制建置預算，所有延後載入 chunks 都納入離線 shell。
- 正式建置由 Vite／Rolldown、Lightning CSS、cssnano、SVGO 與 html-minifier-terser 壓縮；Netlify Function 使用 Terser 設定解決官方 route scanner 的字串語法限制。

## 平台與瀏覽器

Netlify 最新官方 packager 實際打包出 API v2 Function 與 `/api/*` 路由，ZIP 約 2.4 MB。兩個平台的 Web handler 在 Node 24 執行通過，包含釜山、HEAD、非法國家、下載 303 與 Vercel rewrite。報告為 `deployment-report.json`。沒有在使用者的 Netlify／Vercel 帳號正式部署；匯入 repository 即可使用已提交的設定，見 [DEPLOYMENT.md](DEPLOYMENT.md)。

Chromium 45 項檢查涵蓋桌面 1440×1000、手機 390×844、深淺色與跟隨系統、偏好重新載入、桌面／手機側邊欄收合後地圖尺寸、底部控制、安裝提醒自動收起、聚合點選、搜尋、來源 modal 的名稱與鍵盤焦點、詳細資訊、導航、收藏、GPS 拒絕／晚到回呼、非首都與離島切換、拖曳新範圍、離線重新開啟與地圖 chunk 失敗回復。

固定圖磚與真實 OSM 模式分別留存 `browser-fixture-report.json`、`browser-report.json`；固定圖磚只替換外部圖像，API、真實資料、MapLibre、Worker、PWA、定位回呼均為正式建置。console 保留預期離線／刻意下載失敗的網路錯誤；只允許精確匹配軟體 WebGL 的 GPU stall 警告，不允許應用程式警告或未處理錯誤。

## Lighthouse

`bun run test:performance` 使用 Lighthouse 13.5.0、冷啟動 browser profiles、固定圖磚、gzip 預覽、Chromium 軟體 WebGL，以及標準手機／桌面模擬節流。可重跑的程式為 `scripts/performance-qa.py`，完整 JSON／HTML 在 `test-results/`，摘要為 `performance-report.json`。

| 模式 | Performance | Accessibility | Best practices | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| mobile | 66 | 100 | 100 | 2.64 s | 2766 ms | 0 |
| desktop | 66 | 100 | 100 | 0.56 s | 1161 ms | 0 |

首屏移除同步側邊欄量測；地圖在空閒時初始化，清單首批渲染 12 張卡片而保留完整資料。工具提示隨地圖載入，說明與詳細資訊延後載入，外觀使用 shadcn 原生選單。時區時計共用、聚合不再每幀查詢，移除多餘初始 flyTo；沒有為取得分數停用地圖或縮減來源覆蓋。

無障礙與最佳實務通過，但手機 LCP 尚略高於 2.5 秒目標，TBT 也仍超過目標。CPU profile 顯示軟體 WebGL context 建立占用大量同步時間。本機結果不能當成真實手機已通過 Core Web Vitals 的證明；部署後需在實際手機、圖磚供應商與 CDN 下量測。Lighthouse 的頁面 transferBytes 不涵蓋所有 Service Worker 背景 precache 請求，不將它當成完整首次下載量。

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
