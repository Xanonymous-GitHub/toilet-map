# API 探勘與實測紀錄

目前實作已擴大為日本／韓國全國 OSM、地方官方來源，以及 181 城市與周邊選單。實際來源筆數、API 空間分塊及限制以 [COVERAGE.md](COVERAGE.md) 為準；下列內容保留初次探勘與後續進階架構設計。首爾完整 HTTPS 下載及全國 Overpass 已驗證成功，不再依賴 sample 或 private key。

調查日期：2026-10-11。區分「官方文件已確認」「HTTP／樣本已實測」「待帳號或裝置驗證」。本次沒有使用任何私有 API key，沒有申請帳號、付費或部署。

本文件保留初次探勘時的 sample／HTTP／逾時紀錄，並非目前匯入限制。現行首爾來源已使用免 key 的官方 HTTPS 完整檔案取得 4,455 筆；OSM 已取得日本／韓國全國快照。現行 API 與操作指令見 [README.md](../README.md)，實際測試見 [VALIDATION.md](VALIDATION.md)。

## 1. 主要發現

| 來源／功能 | 調查結果 | 建議角色 |
| --- | --- | --- |
| 日本自治體標準 ODS | 數位廳目前標準含第 13 類公衆トイレ一覧；有欄位標準，實際資料按自治體發布 | 主要資料格式，逐地區建 adapter |
| 東京江東區 CSV | HTTP 200；192 筆，192 筆有緯度／經度；免 key | 已驗證的日本初始來源 |
| 東京江東區 JSON API | POST `{}` HTTP 200；`total=192`、`subtotal=2` | CSV 替代，支援分頁 |
| 首爾 OA-22586 / mgisToiletPoi | 公開 sample HTTP 200／INFO-000；五筆有座標；metadata 總數 4,455 | 韓國 MVP 主要來源；完整匯入需 key |
| 韓國全國公廁標準資料 | 官方公告自 2025-02 停止提供 WGS84 經緯度 | 名稱／地址與設備補充；不能直接畫圖 |
| OSM / Overpass | 新宿 1km 樣本成功，64 個物件；首爾 1km 同一查詢兩次 504 | 探勘／補充；正式匯入改區域資料 |
| Google Places New | 官方已列 `public_bathroom`；商業 API／快取與底圖限制 | 可另評估，非本設計的基礎 POI 庫 |
| Google Maps URLs | 官方文件支持同一 HTTPS URL 按環境轉 App／網頁，免 API key | 日本與通用導航 |
| Apple Maps unified URLs | 取得官方文件；新版 `/directions` 與舊系統相容需測 | Apple 裝置導航 |
| NAVER / Kakao links | 已確認官方 URL 格式 | 韓國優先導航；App 啟動需真機測 |

總數、查詢物件數與覆蓋率不同：4,455 是 sample 回傳的全資料集 metadata，這次只取得五筆；64 是 OSM 物件，不一定等於 64 個可供所有人使用的獨立公廁。

## 2. 日本：官方標準與東京實例

數位廳的 [自治體標準開放資料集](https://www.digital.go.jp/resources/open_data/municipal-standard-data-set-test) 頁面於本次調查顯示 2026-08-10 更新；公廁為第 13 類。先前「推奨データセット」名稱已變更，不能只照舊搜尋詞建來源表。

本次未確認到一支涵蓋全日本、欄位一致的官方公廁 API。實作需針對自治體／都道府縣的 CSV、JSON API 或 catalog 接入；統一標準有助正規化，不代表全國統一即時服務。

**已驗證來源：江東區**

- [官方 API 目錄與授權](https://spec.api.metro.tokyo.lg.jp/spec/t131083d0000000019-871f7df0e40ce50322a382fdb88c1de2-0)：CC BY；顯示資料更新 2026-01-27，版本 1.0.4。確切授權版本尚待 catalog 確認，本次 catalog 頁面被回 403。
- [官方 CSV](https://www.opendata.metro.tokyo.lg.jp/koto/131083_013_public_toilet.csv)：免 key，75,459 bytes，UTF-8 BOM，192 rows。
- JSON URL：`https://service.api.metro.tokyo.lg.jp/api/t131083d0000000019-871f7df0e40ce50322a382fdb88c1de2-0/json?limit=2`
- 方法：POST，`Content-Type: application/json`，body `{}`。沒有使用 authentication header。
- 回應：`total`、`subtotal`、`limit`、`offset`、`metadata`、`hits`。
- Swagger 說明 `limit` 上限 1,000，可用 `offset` 分頁；文件中的 placeholder 範例不能直接照傳，空 `{}` 可取得資料。

可重跑的公開資料查詢：

```bash
curl --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  'https://service.api.metro.tokyo.lg.jp/api/t131083d0000000019-871f7df0e40ce50322a382fdb88c1de2-0/json?limit=2'
```

| 東京欄位 | 標準欄位 |
| --- | --- |
| ID | source_record_id，原字串保留 |
| 名称／名称_英語 | name_local／name_en |
| 所在地_連結表記 | address_local |
| 設置位置／建物名等(方書) | entrance_note／building_note |
| 緯度／経度 | lat／lon |
| 車椅子使用者用トイレ有無 | wheelchair，`有`／`無`／unknown |
| 乳幼児用設備設置トイレ有無 | infant_facilities；不直接等同 changing_table |
| オストメイト設置トイレ有無 | ostomate_facilities |
| 利用開始時間／利用終了時間／特記事項 | hours_raw／normalized_hours／exceptions |

全部 192 筆有座標與起訖時間；150 筆 `車椅子…=有`、42 筆 `無`。全部時間相同為 `00:00:00–23:59:00`，時間特記事項均空。需核對它是實際設施時間或填報慣例；不能只看到完整率 100% 就認為現場全天可用已驗證。

本次 CSV／JSON 回應未看到 `Access-Control-Allow-Origin`；這不是全面 CORS 測試結果，足以支持先走後端匯入而非前端直接 fetch。

## 3. 韓國：全國資料與首爾 API

**全國資料的重要變更**

[全國公廁標準資料官方頁](https://www.data.go.kr/data/15012892/standard.do) 明示原始政策自 2025-02 排除 WGS84 latitude／longitude。頁面本次顯示 52,255 行、免費／利用範圍無限制，並稱每日更新到兩天前；這是目錄描述，尚未下載全檔核對。提供形式是官方 CSV 下載，不能照較舊教學假設仍有帶座標的標準 API。

補座標方案按順序：地方官方位置資料 → 可合法再用的已匹配開放資料 → 允許持久保存結果的地址 geocoder。未確認儲存／跨底圖權限前，不批次用商業 geocoder 產生永久地圖庫。地址轉出的建築中心也不等於廁所入口。

**首爾 OA-22586 已驗證**

[首爾官方資料頁](https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do) 說明包含地址、開放時間、廁所／無障礙現況、設施與標示。授權是公共 Nuri 第 1 類：須註明來源，可商用／修改；頁面列不定期更新。頁面資料更新日期不能當成每一間廁所的查核日期。

API 服務名稱：`mgisToiletPoi`（區分大小寫）。官方格式：

```text
http://openapi.seoul.go.kr:8088/{KEY}/{json|xml}/mgisToiletPoi/{START}/{END}/
```

公開樣本（已實測）：

```text
http://openapi.seoul.go.kr:8088/sample/json/mgisToiletPoi/1/5/
```

樣本 HTTP 200，業務碼 `INFO-000`，`list_total_count=4455`，五筆 row。`sample` 最多五筆，正式完整呼叫須申請首爾 API key；正式 key 配額與每頁上限要在取得帳號後確認，不能靠 sample 推論 production quota。

官方頁的「Open API」規格內容是經 AJAX POST 載入：本次對 `https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-22586&srvType=A` POST 表單 `infId=OA-22586&serviceKind=1` 成功；單純 GET 回 404。這是探勘規格頁的方法，正式 ingestion 呼叫前述公開 API，不依賴抓規格 HTML。

| 首爾欄位 | 官方含義／處理 |
| --- | --- |
| OBJECTID | 原始記錄 ID，數字可含 `.0`，轉成穩定字串 |
| COORD_X / COORD_Y | x／y；樣本為約 126.x／37.x，映射 longitude／latitude；完整匯入仍核對 CRS |
| CONTS_NAME | 建築／設施名稱 |
| ADDR_NEW / ADDR_OLD / GU_NAME | 道路地址／地籍地址／行政區 |
| VALUE_01 | 類型；樣本含 `민간개방`（民間開放） |
| VALUE_02 | 開放時間；以 `|` 分隔，含全天／其他等文字 |
| VALUE_04 | 廁所現況 |
| VALUE_05 | 無障礙廁所現況 |
| VALUE_06 | 便利設施／其他設備 |
| VALUE_07 | 引導標示等內容；保留原文，不自行推論現場安全 |
| VALUE_08 / VALUE_09 | 所在設施／備註 |

樣本含 `상시(24시간)|`、`기타|06:00~24:00|` 與 `기타|06:00~25:00|`。需多語 parser 與隔日時間支援；空白字串不當成 no。

本次確認可用的官方入口是 HTTP:8088；HTTPS 正式入口未確認。瀏覽器直接呼叫會有 mixed-content／key 暴露問題，應走後端匯入。後端匯入仍需在正式 key 使用前解決上游 TLS，或採官方 HTTPS 檔案下載；proxy 不會改善原始 HTTP 傳輸加密。

## 4. OSM：跨國補充資料

[OSM 廁所標籤](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtoilets) 是 `amenity=toilets`。探勘使用 nwr，涵蓋 node／way／relation；way／relation 的 center 只是中心，不是入口。需要 `access`、`fee`、`opening_hours`、`wheelchair`、`changing_table`；未標不代表免費、全天或公共。

新宿已成功的查詢：

```overpass
[out:json][timeout:20];
nwr["amenity"="toilets"](around:1000,35.6909,139.7004);
out center tags;
```

Endpoint：`https://overpass-api.de/api/interpreter`，POST form `data=<query>`，免 key。

| 欄位 | 新宿半徑 1km 中有該標籤的物件 |
| --- | --- |
| 全部查得物件 | 64 |
| name | 4 |
| opening_hours | 0 |
| access | 37 |
| fee | 17 |
| wheelchair | 35 |
| changing_table | 8 |

這只是樣本欄位完整度，不能外推日本／韓國全國覆蓋。首爾市廳 1km 同樣格式兩次 HTTP 504，沒有取得資料，不把這視為首爾零公廁。

[Overpass 官方公共資源指南](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) 明列以公共 instance 作一般 app 後端是有問題的用法；約 10,000 requests／day、1GB／day 是使用指引，不是保證配額或 SLA。正式改用區域匯出、自己 instance 或有服務合約的服務。

可評估 [Geofabrik 日本區域下載](https://download.geofabrik.de/asia/japan.html) 及 [韓國下載](https://download.geofabrik.de/asia/south-korea.html)；本次只確認官方入口，沒有下載國家級 PBF，也未量化全國廁所數。

[OSM 授權](https://www.openstreetmap.org/copyright) 為 ODbL，需 attribution，衍生資料庫可能有 share-alike／提供衍生庫義務。各來源分開保存 lineage；若把官方欄位與 OSM 合併成永久資料庫，不可假設「分表」就免除授權義務。

## 5. 地圖底圖與商業 POI 選擇

MapLibre 是地圖渲染器，不附送無限制的圖磚服務。推薦先評估 MapTiler 的日／韓文字、細節與每 session 成本；[官方 React／MapLibre 範例](https://docs.maptiler.com/react/maplibre-gl-js/get-started/) 需要帳號 API key。本次沒有 key，尚未測底圖視覺、用量、帳戶條款或離線權限。Kakao／NAVER 底圖可作韓國替代，但另加 SDK／帳號與跨國 provider 切換維護成本。

[OSM 公共 raster 圖磚政策](https://operations.osmfoundation.org/policies/tiles/) 要求署名與尊重 caching，禁止離線／區域預抓。普通 HTTP cache 與整城離線下載不同。第一版不做城市圖磚下載；不把公共 demo 底圖當保證可承載商業流量的方案。

[Google Places New 類型](https://developers.google.com/maps/documentation/places/web-service/place-types) 已有 `public_bathroom`；`public_bath` 是另一類，不能混用。不是「Google 沒有公廁類別」。

但 [Places API 政策](https://developers.google.com/maps/documentation/places/web-service/policies) 對預抓、儲存與地圖展示有限制；一般條款要求地圖展示結果用 Google Map，place ID 有儲存例外，EEA 帳戶另查其條款。本次沒有 Places key，未實測日韓覆蓋／價格。若改採 Google 全套底圖與 POI，可另作架構方案；不能直接把 Places 結果灌進 MapLibre 的永久離線公廁庫。

Kakao 地址轉座標格式為 `GET https://dapi.kakao.com/v2/local/search/address.json?query=...`，`Authorization: KakaoAK <REST_KEY>`，見 [官方 Local API](https://developers.kakao.com/docs/ko/local/dev-guide)。文件已確認、認證呼叫未測；長期儲存、跨底圖與批次用途要查帳戶服務條款。韓國全國 geocoding 不在 MVP 關鍵路徑。

## 6. 導航 URL 與環境處理

導航轉導無需先建路線 API。以下是本地產生的 URL 範本；並未實測 App 啟動或現場路線。

**Google Maps**

```text
https://www.google.com/maps/dir/?api=1&destination={lat},{lon}&travelmode=walking
```

[官方 Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) 支援 Android／iOS 有 App 時開 App，否則網頁，且免 API key；`api=1` 必須存在。省略 origin，讓地圖服務取得使用者位置。是否進入實際導航仍依當地能力與定位權限。

**Apple Maps**

```text
https://maps.apple.com/directions?destination={lat},{lon}&mode=walking
```

[Apple unified Maps URLs](https://developer.apple.com/documentation/mapkit/unified-map-urls) 官方文件列新版 iOS 18.4／macOS 15.4 等平台與 `/directions`、`destination`、`mode=walking`。舊版相容候選是 `https://maps.apple.com/?daddr={lat},{lon}&dirflg=w`；需舊／新裝置實測決定採用與 fallback。文件已下載供檢視；不能把新版支援推論為所有 Apple 系統都一致。

**NAVER Map**

```text
nmap://route/walk?slat={fromLat}&slng={fromLon}&sname={encodedFromName}&dlat={lat}&dlng={lon}&dname={encodedName}&appname={encodedPwaUrl}
```

[NAVER 官方 scheme 文件](https://guide.ncloud-docs.com/docs/en/application-maps-url-scheme-vpc) 指定 `nmap://`、`route/walk`，所有 URL 需 `appname`，手機網站填網頁 URL。僅 App 安裝時可用；起點參數依官方 common parameters 處理，無定位時不填假起點，可改目的地 place／網頁。上例只有使用者確實定位且選了導航時才使用 from 座標。

Android Chrome 可評估官方 Intent 格式與 `browser_fallback_url` 的支援；iOS／PWA 提供獨立網頁入口。第一版韓國通用網頁 fallback 採 Kakao，避免依賴未確認穩定的 NAVER 網頁 route URL。

**Kakao Map**

```text
https://map.kakao.com/link/to/{encodedName},{lat},{lon}
https://map.kakao.com/link/map/{encodedName},{lat},{lon}
https://map.kakao.com/link/by/walk/{encodedFromName},{fromLat},{fromLon}/{encodedName},{lat},{lon}
```

[Kakao 官方 Web API guide](https://apis.map.kakao.com/web/guide/) 列出依座標建立地圖與目的地連結。`link/to` 可交給服務選路線；若需指定步行，官方參數是 `walk`，可依上例與有效起點組成，仍需真機測試。HTTPS 必須提供可用網頁入口，App 轉導行為受瀏覽器設定影響。

統一用 URL／URLSearchParams 或正確的 encodeURIComponent 處理各參數，名稱不可直接拼接；坐標服務參數通常 lat,lon，GeoJSON 卻是 [lon,lat]。驗收包括 App 未裝、深連結禁用、內嵌瀏覽器、桌面與 PWA standalone，不把定時器當成可靠安裝偵測。

## 7. 正式實作前的具體待辦

1. 初次探勘待辦已完成：首爾改用免 key 的官方 HTTPS 完整檔案匯入；若未來改走需 key 的 API，仍須確認正式配額與 TLS 入口。
2. 東京更多自治體來源（優先旅遊區）與各來源授權版本；江東區本次是成功樣本，不是全東京。
3. 圖磚供應商帳號、日韓文字與道路細節、手機效能、使用／快取政策與月成本；公共圖磚不做離線預抓。
4. 日韓 Google／Apple／NAVER／Kakao 真機導航矩陣；本次只查官方 URL 規格。
5. 日本／韓國全國 OSM 快照匯入與欄位稽核已完成，見 `research/expansion-osm/`；更新時仍須保留失敗前的成功資料。
6. 若全國地址 geocoding，另確認儲存與授權權限、預算與定位誤差；先把無座標記錄留待處理。

## 8. 證據檔案

`research/probe-results.json` 為成功／失敗結果的整理版，含時間、HTTP 狀態、欄位完整度與樣本。`research/seoul-api-probe.json` 是首爾 sample 實測，`seoul-spec-probe.json` 是成功的 POST 規格頁探勘。原始快照在 `research/samples/`；結果可重跑但會隨資料與服務負載改變。

文件的 UI／API 合約、快取 TTL、性能與工期均為設計提案。資料來源的 metadata、HTTP 成功與抽樣完整度是已驗證結果；現場可用性、真機導航、完整資料覆蓋與正式服務穩定性仍需下一階段驗收。
