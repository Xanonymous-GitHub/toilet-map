# 第一版驗證紀錄

驗證日期：2026-10-11 UTC。目標為私人測試版；資料涵蓋首爾與東京江東區／新宿探勘範圍。

## 已通過

- `bun install --frozen-lockfile` 與 `uv sync --locked`：鎖檔可重複安裝。
- `bun run verify`：Bun／Vite 正式建置、Biome recommended lint（warnings 視為失敗）、Ruff lint 與 format check、TypeScript strict（含獨立 Service Worker 型別）以及 18 項 Bun 原生測試通過。
- 測試涵蓋開放時間、跨午夜、韓國 25:00、資格與設施未知、導航格式、完整分頁、拒絕重複／循環／截斷／混用版本、非法參數、HEAD／405、PWA 資產及 OSM 匯出。
- `bun run deps:check`：15 項直接套件／工具版本均與官方最新穩定版一致，記錄於 `dependency-versions.json`。GitHub Actions 版本也已向官方 release 查證並固定。
- Python normalization regression：整理後的 importer 與保存原始資料產生相同的 4,711 筆紀錄及資料版本。
- Chromium：24 項操作檢查，桌面 1440×1000、手機 viewport 390×844。除原有地圖、詳細資訊、導航、收藏、定位、篩選、來源、搜尋、Service Worker、離線、手機與安裝說明，另驗證手動縮放會清除 watcher、重新載入確實請求資料、損壞收藏可復原，以及晚到定位不會覆蓋使用者選擇。另確認 Worker 的 JavaScript MIME、離線快取與實際聚合標記可顯示及點選；沒有 Worker 載入錯誤。
- 原生 dialog 的鍵盤驗證確認背景控制項不會取得焦點，符合 modal 的 inert 行為；瀏覽器自身介面仍可取得焦點。

機器可讀結果：`browser-report.json`。瀏覽器程式：`scripts/browser-qa.py`；截圖寫入忽略的 `test-results/`。Vite 仍提示地圖套件造成較大的 JavaScript chunk，主程式 gzip 約 367 KB，另有地圖 Worker 約 144 KB gzip；尚未進行低速行動網路效能量測。GitHub CI workflow 已配置，已在本地執行相同的必要關卡；目前 Sites 的來源 Git 服務不會自行執行 GitHub Actions。

## 資料驗證

| 來源 | 原始筆數 | API 候選筆數 | 驗證 |
| --- | ---: | ---: | --- |
| 東京江東區 | 192 | 192 | 官方 CSV，全數有有限且在東京範圍的座標、唯一來源 ID |
| 首爾 | 4,455 | 4,455 | 官方完整 HTTPS 下載；JSON／CSV 筆数與 ID 相符，抽樣與 sample API 相符 |
| 新宿 OSM | 64 | 42 | 探勘原始物件保留；22 筆限顧客物件從候選 API 排除 |
| 合計 | 4,711 | 4,689 | 不跨來源合併、不補造座標、不將未知推定為免費或開放 |

首爾 20 筆使用類別不明及 OSM 資格未標記的物件仍以未知資訊提供，UI 標為「條件未知」。開放狀態只依官方或 OSM 的時段推估，沒有現場即時查核來源。

## 測試環境與實機範圍

代理環境的 Chromium 未信任當次代理 CA。使用一次性 Playwright 來源橋接器，由 Python 保留代理及 CA 驗證取得公開圖磚／字型，再交給測試頁面；沒有修改使用者的永久 TLS 信任設定，沒有關閉瀏覽器 TLS 驗證。離線階段停用橋接器並將瀏覽器設為 offline，API 失敗後從 IndexedDB 恢復 4,455 筆首爾資料。離線期間的底圖／API 網路錯誤為預期行為。

瀏覽器使用模擬座標及手機 viewport。尚未在真實 iPhone／Android 裝置確認 GPS 精度、主畫面安裝，以及 Apple／Google／NAVER App 的實際交接。導航 URL 格式已驗證；OS 是否開啟 App 取決於安裝情況與預設設定。

已瀏覽城市的資料可離線重開；底圖不預下載、不加入 Service Worker 離線快取。資料更新由匯入器執行後重新部署，本版沒有每日背景排程。
