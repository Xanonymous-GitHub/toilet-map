# 全國覆蓋版驗證紀錄

工具鏈與應用程式重新驗證日期：2026-10-12（Asia/Taipei）。資料快照與來源探勘日期仍為 2026-10-11，未重新下載或改變發布資料；測試報告的機器時間保留 UTC。本版整合日韓全國 OSM 及地方官方來源，提供 181 個城市與周邊快捷範圍。

## 已通過

- `bun install --frozen-lockfile` 與 `uv sync --locked`：鎖檔可重複安裝。
- `bun run verify`：Bun／Vite 正式建置、chunk 大小預算、Biome recommended lint（warnings 視為失敗）、Ruff lint 與 format check、TypeScript strict（含獨立 Service Worker 型別），以及 **23 項 Bun 原生測試與 4 項 Python 回歸測試**通過。`lint`、`typecheck`、`check`、`test` 與 `format` 也分別執行；型別與 API 測試在建置產生 generated modules 後執行。
- API 逐一查詢全部 181 城市，確認有實際候選、筆數對帳、國家一致與 bounds 內座標。首爾 5,952 筆候選的完整分頁沒有漏頁或重複 ID；以首爾 region 查詢釜山 bbox 也可取得該國其他城市資料。
- 測試涵蓋非首都及離島定位、開放時間與跨午夜、韓國 `25:00`、星期／假日條件保留未知、資格與設施未知、導航格式，以及拒絕重複／循環／截斷／混用版本或 bounds 的分頁。
- 非法參數、過大範圍、加上 fetch padding 後的範圍上限、HEAD／405、PWA MIME／快取及完整 OSM 原始／衍生匯出均通過。
- `bun run deps:check`：15 項直接套件／工具版本均與官方最新穩定版一致，見 `dependency-versions.json`；MapLibre 為 6.14.0。GitHub Actions 維持 2026-10-11 向官方 release 查證並固定的版本。
- `bun run data:expand` 重跑後，`git diff --exit-code -- data docs/coverage.json` 無差異，仍為 45,867 筆有效來源紀錄與相同資料版本。2026-10-11 的兩個匯入器及獨立乾淨目錄驗證屬歷史紀錄；此次 checkout 缺少 ignored 東京／首爾原始檔，`import-data.py` 因缺少必要檔案而拒絕執行，未使用 `--refresh` 變更資料。公開下載 metadata、SHA-256 與欄位稽核隨研究目錄保存。
- Chromium **36 項完整檢查**以真實公開圖磚與 CI 固定 PNG 圖磚模式通過，包含相模原、倉敷、大阪、札幌、金浦、釜山、濟州切換；釜山 GPS 正確選擇釜山；國家切換記住上次城市；拖曳超出初始範圍發出新的 bbox 請求。縮放與拖曳前等待目的地 viewport，修正資料載入早於地圖飛行完成的測試競態。
- 桌面 1440×1000／手機 viewport 390×844，確認地圖及實際聚合標記、詳細資訊、導航、收藏、定位權限、篩選、來源、搜尋、Service Worker、離線清單、手機捲動與安裝說明。手動縮放會停止 watcher，晚到定位不會覆蓋使用者選擇，損壞收藏可復原。
- 原生 dialog 的鍵盤檢查確認背景控制項不會取得焦點，符合 modal 的 inert 行為。沒有未處理的 JavaScript 或地圖 Worker 載入錯誤。
- 新增地圖模組下載失敗檢查：刻意阻斷 MapLibre chunk 時顯示 fallback，廁所清單與詳細資訊仍可操作；沒有應用程式 console warnings。
- 2026-10-11 的底圖警示修正另以 **2 項定向瀏覽器檢查**通過：實際阻斷圖磚請求仍可使用廁所清單；解除阻斷後取得 25 個經 CA 驗證的真實 OSM 圖磚，舊警示會清除。`map-recovery-report.json` 保留當時版本的歷史證據，未將其 hash 當成本次建置。

機器可讀結果：`browser-report.json`（本次真實圖磚）、`browser-fixture-report.json`（本次 CI 模式）、`dependency-versions.json`，以及歷史 `map-recovery-report.json`。完整操作程式為 `scripts/browser-qa.py`；截圖保存於 ignored `test-results/`。正式建置沒有 chunk 大小警告：初始程式 gzip 約 94 KB、延後載入的 MapView 約 3 KB、MapLibre 約 283 KB；地圖 Worker 原始約 508 KB。每個應用程式 chunk 的 500,000 bytes 與 MapLibre 的 1,100,000 bytes 預算由建置強制檢查，所有延後載入 chunks 都納入 PWA precache。尚未量測低速行動網路效能。CI workflow 已配置，並在本地執行相同的必要關卡；未於此次工作觸發遠端 GitHub Actions。

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

## 測試環境與實機範圍

本次使用 macOS、Bun 1.4.3、Python 3.15.0、uv 0.12.23 與 Playwright 管理的 Chromium。沒有 HTTP／HTTPS 代理時由瀏覽器直接載入公開圖磚／字型，保留 TLS 驗證與正常 HTTP 快取；不再以同步 Python 下載逐一阻塞圖磚，避免真實圖磚模式逾時。CI 模式攔截底圖為固定 PNG，使用系統字型。

2026-10-11 的代理環境使用 CA 驗證來源橋接器；程式保留此模式，僅設定代理時啟用，未修改永久 TLS 信任或關閉瀏覽器 TLS 驗證。離線階段停用橋接器並設定 browser offline，API 失敗後由 IndexedDB 恢復最近下載的相同範圍。離線及刻意阻斷地圖模組的網路錯誤為預期行為。Chromium 軟體 WebGL 截圖可能記錄 `GPU stall due to ReadPixels`；報告保留這些驅動診斷，只允許精確匹配的訊息，其他 console warnings 使檢查失敗。

瀏覽器使用模擬座標及手機 viewport。尚未在真實 iPhone／Android 確認 GPS 精度、主畫面安裝與地圖 App 交接。導航 URL 格式已驗證；OS 是否開啟 App 取決於安裝情況與預設設定。

已瀏覽的最近範圍可離線重開；底圖不預下載、不加入 Service Worker 離線快取。資料更新由匯入器執行後重新部署，本版沒有每日背景排程。
