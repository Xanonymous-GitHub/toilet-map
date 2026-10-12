# GitHub Actions

[Quality 執行紀錄](https://github.com/Xanonymous-GitHub/toilet-map/actions/workflows/quality.yml)

## 每次提交與 Pull Request

`quality.yml` 在 push、pull_request 或手動執行時啟動兩個 job：

| Job | 檢查 |
| --- | --- |
| Build, lint, types, tests and data integrity | frozen／locked 安裝、正式建置、大小與壓縮／註解檢查、Netlify 實際打包、Vercel handler、Biome、Ruff lint／format、TypeScript strict、42 項 Bun 與 4 項 Python 測試，以及從提交快照重現相同 dataset |
| Desktop, mobile and offline browser checks | Playwright Chromium 的 109 項檢查（69 項原有回歸＋32 項狀態／分享＋8 項底圖失敗／恢復），含非首都城市切換、定位、導航 URL、收藏、篩選、地圖聚合、320／375／390／430px、短視窗與觸控橫向排版、清單遮擋與觸控範圍、深淺色／系統切換、側邊欄收合、安裝提醒、離線重開與地圖模組下載失敗，以及跨使用者分享、瀏覽歷程、四種捲動還原、快取升級與儲存受限 |

Bun 版本取自 `.bun-version`（1.4.3）；Python 使用 3.15 系列，uv 為 0.13.0。Actions 固定完整 commit SHA，註解保留已查證的 release 版本標籤。Workflow 僅需要 `contents: read`；新提交會取消同一 ref 的舊執行。

瀏覽器 CI 使用提交的真實向量圖塊與供應商非文字樣式圖層；不向外部服務抓取字形或 sprites。公廁資料、API、MapLibre Worker、定位回呼與 PWA 資產使用真正的本機正式建置，外部導航檢查 URL。這個模式驗證 App 操作與離線流程；一般 `bun run test:browser` 使用真實公開圖磚，沒有代理時由瀏覽器直接以 TLS 驗證載入，有代理時使用 CA 驗證橋接器。底圖回歸另外模擬樣式 403、部分圖塊失敗、手動重試、選取／鏡頭保存與快速切換外觀，並禁止請求舊的 OSM raster host。設定 `RELIEF_QA_REAL_BASEMAP=1` 執行底圖專項腳本，可再檢查 3 種真實服務畫面；真實服務不作為 CI 的依賴。驗證範圍見 [VALIDATION.md](VALIDATION.md)。

成功建置保存 `production-build` 與 `deployment-checks` artifacts；瀏覽器 job 無論成功或失敗，都保存報告、截圖及 preview log 到 `browser-results`。Artifacts 保留 14 天。

## 依賴版本

不設依賴刷新 workflow。實作或更新時執行 `bun run deps:check`，查詢官方 registry／PyPI／Bun releases；結果寫入 `.cache/dependency-versions.json`，供當次更新審查。

## 本機執行

```bash
bun install --frozen-lockfile
uv sync --locked
bun run verify
bun run data:expand
git diff --exit-code -- data docs/coverage.json
bun run preview
```

另一個 terminal 執行固定圖磚模式：

```bash
uv run --locked playwright install chromium
RELIEF_QA_FIXTURE_ASSETS=1 bun run test:browser
```

預設使用本機 `/usr/bin/chromium`，沒有該程式時使用 Playwright 管理的 Chromium；也可透過 `RELIEF_CHROMIUM_PATH` 指定。預覽與測試的網址可由 `RELIEF_PORT`／`RELIEF_BASE_URL` 配置。
