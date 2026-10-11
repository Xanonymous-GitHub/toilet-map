# GitHub Actions

[Quality 執行紀錄](https://github.com/Xanonymous-GitHub/toilet-map/actions/workflows/quality.yml) · [依賴版本檢查](https://github.com/Xanonymous-GitHub/toilet-map/actions/workflows/dependencies.yml)

## 每次提交與 Pull Request

`quality.yml` 在 push、pull_request 或手動執行時啟動兩個 job：

| Job | 檢查 |
| --- | --- |
| Build, lint, types, tests and data integrity | frozen／locked 安裝、正式建置與 chunk 大小預算、Biome、Ruff lint／format、TypeScript strict、23 項 Bun 與 4 項 Python 測試，以及從提交快照重現相同 dataset |
| Desktop, mobile and offline browser checks | Playwright Chromium 的 36 項檢查，含非首都城市切換、定位、導航 URL、收藏、篩選、地圖聚合、手機排版、離線重開與地圖模組下載失敗 |

Bun 版本取自 `.bun-version`（1.4.3）；Python 使用 3.15 系列，uv 為 0.12.23。Actions 固定完整 commit SHA，註解保留已查證的 release 版本標籤。Workflow 僅需要 `contents: read`；新提交會取消同一 ref 的舊執行。

瀏覽器 CI 的底圖使用提交的固定 PNG 圖磚，字型使用系統 fallback。公廁資料、API、MapLibre Worker、定位回呼與 PWA 資產使用真正的本機正式建置，外部導航檢查 URL。這個模式驗證 App 操作與離線流程；一般 `bun run test:browser` 使用真實公開圖磚，沒有代理時由瀏覽器直接以 TLS 驗證載入，有代理時使用 CA 驗證橋接器。驗證範圍見 [VALIDATION.md](VALIDATION.md)。

成功建置保存 `production-build` artifact；瀏覽器 job 無論成功或失敗，都保存報告、截圖及 preview log 到 `browser-results`。Artifacts 保留 14 天。

## 依賴版本

`dependencies.yml` 每週一 03:00 UTC（Asia/Taipei 11:00）或手動執行 `bun run deps:check`，查詢官方套件庫的最新穩定版。JavaScript 版本取自 `package.json`，Python 直接開發依賴版本取自 `uv.lock`，Bun 取自 `.bun-version`，不把 Python 的 `>=` 範圍當成實際版本。出現新版時檢查失敗，版本比較 JSON 保存為 `dependency-versions` artifact，供更新時審查。

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
