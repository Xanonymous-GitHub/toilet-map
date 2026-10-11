# 韓國非首都官方資料快照

2026-10-11 取得與驗證，全部從 data.go.kr 普通公眾下載流程取得；不用登入或 API key。
`normalize.py` 只用 Python 標準庫，回傳 `records`、`sources`、`quality`，不修改發布資料。

| 官方來源 | 原始列／點 | 歸一化有效設施 | 來源基準日 | 目錄修改日 |
| --- | ---: | ---: | --- | --- |
| [釜山 갈맷길 SHP](https://www.data.go.kr/data/15084238/fileData.do) | 197 | 197 | 2025-10-30 | 2026-03-25 |
| [仁川 미추홀구](https://www.data.go.kr/data/15071405/fileData.do) | 72 | 72 | 2026-07-31 | 2026-08-31 |
| [濟州市](https://www.data.go.kr/data/15110521/fileData.do) | 503 | 490 | 2025-12-31 | 2026-03-12 |
| [全北特別自治道](https://www.data.go.kr/data/15134318/fileData.do) | 2,839 | 2,791 | 2024-07-29 | 2025-08-23 |
| 合計 | 3,611 | 3,550 | | |

授權原文均為 `이용허락범위 제한 없음`（利用許諾範圍無限制），連至[官方使用政策](https://www.data.go.kr/ugs/selectPortalPolicyView.do)。各資料提供機關與來源連結保留在 sources。基準日不表示現場查核時間。

濟州排除 12 筆未提供座標與 1 筆不合法緯度（66.50444397）。全北全部 2,839 列座標有效，但同名稱、地址與座標有 48 組重複；合併為同一設施。32 組開放時間原文不同，時間留未知並加註原文，5 組使用類別不同，資格留未知。沒有自行更正座標或地理編碼。

釜山讀取 SHP WGS84 Point，驗證檔案長度、geometry type、DBF 對齊、UTF-8、全部點坐標與 DBF 經緯度一致。原始 Point ID 與 14 個 DBF 欄位存於 `busan-point-fields.json`。DBF 欄位名的 10-byte 上限截斷韓文 UTF-8；僅欄位名稱忽略未完成位元組，值完整解碼。

設備未知維持未知。濟州市的無障礙便器數只寫入備註，無障礙入口未提供，不能直接推論 wheelchair=yes。公眾開放類別保留 public_by_agreement；開放時間原文保留，收費未提供。

```bash
uv run --locked python research/expansion-korea/normalize.py
uv run --locked ruff check research/expansion-korea
uv run --locked ruff format --check research/expansion-korea
```

原始下載及 normalization 輸出在 ignored `data/raw/expansion-korea/`。本研究目錄另保存 `evidence.json` 與 `busan-point-fields.json`，提供公開來源／下載網址、時間、SHA256、編碼、排除明細與 SHP 欄位對照，讓來源證據隨程式碼保留。

上述 normalize 指令需要這些原始檔與目錄證據；乾淨 checkout 若只要重現已提交的發布資料，請執行 `bun run data:expand`，它會保留已發布的地方官方紀錄。

`refresh.py` 提供普通官方下載流程範例，執行前需重新查核目錄的版次、日期、欄位與授權；目前 normalize 的版次日期明確固定在已驗證快照，不可把新快照沿用舊日期。擴充 importer 可改從目錄取得日期後再驗證更新。

```bash
uv run --locked python research/expansion-korea/refresh.py
```

[韓國全國公廁標準資料](https://www.data.go.kr/data/15012892/standard.do)於 2026-10-11 查證時目錄列 52,255 行，但官方聲明 2025-02 起移除 WGS84 經緯度；下載入口是 `https://file.localdata.go.kr/file/public_restroom_info/info`，當時環境普通 HTTPS 請求收到 403。沒有用其他路徑繞過，也沒有列入地圖覆蓋筆數。全國地圖可用 OpenStreetMap 真實點位補足，官方地方快照提供較完整設施資訊。
