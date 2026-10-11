# 一點方便 — 日韓公廁地圖 PWA

繁體中文、手機優先的公廁地圖。定位、地圖範圍清單、開放時段推估、無障礙／免費篩選、裝置收藏、外部步行導航，以及已瀏覽城市的離線清單。

目前整合日本／韓國全國範圍的 OSM 快照，以及江東區、首爾、釜山、仁川、濟州市、全北的官方資料。45,867 筆有效來源紀錄中，API 排除 1,250 筆明示使用限制，提供 44,617 筆候選紀錄（日本 31,238、韓國 13,379）。181 個城市與周邊查詢範圍均有實際點位，包含日本全部 20 個政令指定都市、北海道、沖繩、濟州及離島。

全國範圍指來源查詢範圍，不代表每間公廁皆已收錄；城市範圍是矩形而非行政界線，會重疊。同設施的跨來源紀錄可能重複，筆數不能當成獨立設施數。開放／免費／使用條件未知時保留未知；現場可用狀態尚無感測來源。完整城市筆數與來源品質見 [覆蓋紀錄](docs/COVERAGE.md)。

## 開發與驗證

需要 Bun 1.4.3、Python 3.12 以上與 uv。使用 `bun.lock`、`uv.lock` 鎖定版本；所有直接套件依賴已向官方套件庫查證為最新穩定版。版本紀錄見 `docs/dependency-versions.json`。

```bash
bun install --frozen-lockfile
uv sync --locked
bun run build
bun test tests
bun run preview
```

預覽：http://127.0.0.1:8787。Vite 開發前端可另執行 `bun run dev`，API 使用已啟動的預覽伺服器。定位、Service Worker 在正式環境需要 HTTPS；localhost 可測試。

建置產物 `dist/server/index.js` 是 Cloudflare Worker ESM，內含前端資產及經驗證的資料快照。公廁依國家及 0.25° 空間格分塊壓縮；每個請求只解壓與範圍交集的格子，解壓快取上限為 8,000 筆。前端只載入選定城市與周邊／最近地圖範圍，不預載全國資料。`dist/.openai/hosting.json` 保留 Sites 專案 ID。前端為 React / TypeScript / MapLibre；後端不需要資料庫或私有地圖 API key。

## 程式碼品質

`bun run verify` 依序建置、執行 Biome、Ruff、TypeScript 與 Bun 原生測試。`bun run format` 統一格式與整理 imports；`bun run deps:check` 查核是否有新的穩定版。`.github/workflows/quality.yml` 提供相同的 CI 檢查。

- Biome：JavaScript／TypeScript／TSX／CSS／JSON 格式與 recommended lint；警告視為失敗。
- Ruff：Python 的 E／F／I／B／UP／SIM 規則與格式檢查。
- TypeScript：strict、未使用變數／參數、switch fallthrough；Service Worker 使用獨立 WebWorker 型別設定。
- 定位與資料載入拆成獨立 hooks，詳細資訊與原生 dialog 拆成 UI 元件。分頁拒絕重複 ID、截斷資料、循環游標與混用版本。
- 前端由 Vite 建置，Worker 與 Service Worker 由 Bun 原生打包。快取版本依資產內容與資料版本產生，相同輸入可重複建置。
- CSS 的 `noDescendingSpecificity` 在單一 stylesheet 停用：它會將不同元件的 `button`／`span` 規則誤判為衝突，也無法判定預期的響應式覆寫。其他 Biome recommended 規則保持啟用。

## API

| 端點 | 用途 |
| --- | --- |
| `GET /api/v1/regions` | 181 城市、預設 bounds、國家與城市候選筆數、資料版本 |
| `GET /api/v1/toilets?region=busan&limit=1000&cursor=0` | 城市與周邊 bounds 的候選紀錄，游標分頁 |
| `GET /api/v1/toilets?region=tokyo&bbox=135.3,34.5,135.7,34.9` | 同國家範圍查詢，亦可在大阪取得資料；每邊最多五度 |
| `GET /api/v1/toilets/:id` | 單一候選設施，未提供或排除者回傳 404 |
| `GET /api/v1/sources` | 原始來源、授權、擷取日期 |
| `GET /api/v1/osm-export?country=JP` | 各國完整 OSM 原始與整理資料，串流 JSON 下載 |

清單欄位包含 `id`, `name`, `address`, `lat`, `lon`, `access`, `fee`, `wheelchair`, `changingTable`, `hoursRaw`, `timezone`, `sourceId`, `fetchedAt`。來源未提供的布林條件保留 `unknown`，不推論免費、尿布台或全入口無障礙。

## 資料更新

`bun run data:expand` 整合已查證的全國 OSM 與地方官方 snapshots。原始檔存在 ignored `data/raw/` 時會使用該版本；否則 OSM 使用 tracked country snapshots，地方官方保留 published records。OSM SHA-256 必須與查詢 metadata 相符。普通下載工具與日期／欄位／授權證據在 `research/expansion-osm/`、`research/expansion-korea/`。

```bash
bun run data:expand
uv run --locked python scripts/import-data.py --refresh
bun run build
bun test tests
```

`import-data.py --refresh` 使用東京都公開 CSV 與首爾一般公開 HTTPS 下載表單，不使用 API 私鑰，並保留全國擴充資料。座標、名稱、來源 ID、重複值與最低資料量驗證成功後才取代快照。全國 OSM 為已保存的來源快照，不會在每次使用者移動地圖時呼叫 Overpass。新版 snapshot、metadata 與資料版本需一併更新後重建部署；本版未設定背景排程。若來源資料量變化，請同步審查測試中的基準數量。

## 使用與來源限制

- 「時段開放」依日本／韓國當地時間計算，並非現場確認。平日限定、假日例外、營業時間等複雜時段保留未知；支援跨午夜與韓國 `25:00` 表記。
- GPS 用於裝置內排序、移動地圖與使用者點選的導航 URL；API 請求包含地圖範圍，沒有獨立的 GPS 或移動軌跡寫入介面。導航服務會收到使用者主動交付的目的地，以及使用者已定位時的起點。
- Google / Apple URL 由系統決定開啟 App 或網頁。韓國可使用 Kakao 網頁及 NAVER App；NAVER 未安裝時可改選 Kakao。
- IndexedDB 保存各城市最近下載的範圍，Service Worker 保存 App 資產。底圖不預下載、不加入離線快取；外部導航需網路或地圖 App 本身支援。
- OSM 公共圖磚供目前的小規模私人測試使用，遵守標示與瀏覽器正常 HTTP 快取。擴大服務前應選定有容量與 SLA 的圖磚供應商。
- 江東區／東京都：官方 API 來源標示 CC BY；未推定授權版本。首爾：KOGL 第 1 類，`출처: 서울특별시 「서울시 공중화장실 위치정보」`。
- OSM：© OpenStreetMap contributors，ODbL 1.0。各來源保留來源 ID、不跨來源合併紀錄；OSM 原始與正規化部分可由匯出 API 取得。原始資料授權不因本專案的程式碼而改變。
- 釜山、仁川、濟州市與全北官方來源：目錄標示 `이용허락범위 제한 없음`（利用許諾範圍無限制）；提供機關及來源連結保留於紀錄。

完整探勘與後續系統設計見 `docs/`。目前用打包快照降低初期維運成本；擴大涵蓋時可將相同 schema 搬到持久儲存，加入獨立更新工作、版本切換與人工查核。

## 瀏覽器驗證

可另外使用已安裝的 Python Playwright 與 Chromium 執行 `bun run test:browser`。先啟動建置後的預覽伺服器；結果與截圖寫入 `test-results/`。雲端代理憑證環境中，測試橋接器用受信任 CA 驗證 HTTPS 後提供公開底圖／字型回應，保留瀏覽器的 TLS 驗證；離線階段關閉橋接器。完整驗證紀錄見 `docs/VALIDATION.md`。
