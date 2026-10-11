"""Normalize four downloaded official Korean snapshots without external dependencies.

The point SHP/DBF reader is deliberately restricted to the verified Busan format.
It validates geometry, field encoding, alignment, and coordinate bounds. It is not
a general GIS parser. Published datasets are not edited by this research importer.
"""

import csv
import hashlib
import io
import json
import math
import re
import struct
import zipfile
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "expansion-korea"
POLICY = "https://www.data.go.kr/ugs/selectPortalPolicyView.do"
SOURCE_CONFIG = {
    "kr-busan-galmatgil": {
        "file": "busan-galmatgil.zip",
        "catalog": "busan-catalog.html",
        "region": "busan",
        "name": "釜山官方資料・갈맷길",
        "url": "https://www.data.go.kr/data/15084238/fileData.do",
        "edition": "2025-10-30",
        "catalogUpdatedAt": "2026-03-25",
        "note": "釜山 갈맷길 步道沿線；不是釜山市全部設施。SHP 為 WGS84 點位。",
    },
    "kr-incheon-michuhol": {
        "file": "incheon-michuhol.csv",
        "catalog": "incheon-catalog.html",
        "region": "incheon",
        "name": "仁川官方資料・미추홀구",
        "url": "https://www.data.go.kr/data/15071405/fileData.do",
        "edition": "2026-07-31",
        "catalogUpdatedAt": "2026-08-31",
        "note": "仁川 미추홀구 公共與開放廁所；不是仁川市全部設施。",
    },
    "kr-jeju-city": {
        "file": "jeju.csv",
        "catalog": "jeju-catalog.html",
        "region": "jeju",
        "name": "濟州市官方資料",
        "url": "https://www.data.go.kr/data/15110521/fileData.do",
        "edition": "2025-12-31",
        "catalogUpdatedAt": "2026-03-12",
        "note": "濟州市公廁；不是濟州島全境。排除未提供座標與不合法座標，不推測位置。",
    },
    "kr-jeonbuk": {
        "file": "jeonbuk.csv",
        "catalog": "jeonbuk-catalog.html",
        "region": "jeonju",
        "name": "全北特別自治道官方資料",
        "url": "https://www.data.go.kr/data/15134318/fileData.do",
        "edition": "2024-07-29",
        "catalogUpdatedAt": "2025-08-23",
        "note": "全北省資料，涵蓋全州、群山等地；來源為一次性快照。"
        "未提供逐筆查核日期；同設施重複紀錄合併，開放時間衝突保留未知。",
    },
}


def fetched_at(path):
    return datetime.fromtimestamp(path.stat().st_mtime, UTC).isoformat()


def read_csv(path):
    return list(csv.DictReader(io.StringIO(path.read_bytes().decode("cp949"))))


def read_busan(path):
    with zipfile.ZipFile(path) as archive:
        crs = archive.read("gmgRestroomInfo.prj").decode("ascii")
        if 'GEOGCS["GCS_WGS_1984"' not in crs or 'UNIT["Degree"' not in crs:
            raise ValueError("Busan source CRS changed")
        if archive.read("gmgRestroomInfo.cpg").decode().strip().upper() != "UTF-8":
            raise ValueError("Busan DBF encoding changed")
        shp = archive.read("gmgRestroomInfo.shp")
        dbf = archive.read("gmgRestroomInfo.dbf")
    if len(shp) < 100 or struct.unpack(">i", shp[:4])[0] != 9994:
        raise ValueError("Invalid SHP header")
    if struct.unpack(">i", shp[24:28])[0] * 2 != len(shp):
        raise ValueError("Truncated SHP")
    if struct.unpack("<2i", shp[28:36]) != (1000, 1):
        raise ValueError("Only WGS84 point SHP is accepted")
    points = []
    offset = 100
    while offset < len(shp):
        number, words = struct.unpack(">2i", shp[offset : offset + 8])
        offset += 8
        size = words * 2
        content = shp[offset : offset + size]
        if number != len(points) + 1 or size != 20 or len(content) != size:
            raise ValueError("Invalid point record structure")
        if struct.unpack("<i", content[:4])[0] != 1:
            raise ValueError("Unexpected non-point geometry")
        points.append((number, *struct.unpack("<2d", content[4:])))
        offset += size
    total = struct.unpack("<I", dbf[4:8])[0]
    header, record_length = struct.unpack("<2H", dbf[8:12])
    if total != len(points) or len(dbf) < header + total * record_length:
        raise ValueError("SHP and DBF counts differ or DBF is truncated")
    fields = []
    offset = 32
    while offset < header and dbf[offset] != 13:
        descriptor = dbf[offset : offset + 32]
        # Legacy DBF names cap at 10 bytes; Korean UTF-8 can end mid-character.
        name = descriptor[:11].split(b"\0")[0].decode("utf-8", errors="ignore")
        fields.append((name, descriptor[16]))
        offset += 32
    if len({name for name, _ in fields}) != len(fields):
        raise ValueError("Duplicate truncated DBF field names")
    if sum(size for _, size in fields) + 1 != record_length:
        raise ValueError("Unexpected DBF field widths")
    rows = []
    for index, (point_id, lon, lat) in enumerate(points):
        start = header + index * record_length
        record = dbf[start : start + record_length]
        if record[:1] != b" ":
            raise ValueError("Deleted or invalid DBF record; alignment must be reviewed")
        offset = 1
        values = {}
        for name, size in fields:
            values[name] = record[offset : offset + size].decode("utf-8").strip()
            offset += size
        if not math.isclose(float(values["위도"]), lat, abs_tol=0.0000001):
            raise ValueError("SHP latitude differs from DBF")
        if not math.isclose(float(values["lon"]), lon, abs_tol=0.0000001):
            raise ValueError("SHP longitude differs from DBF")
        rows.append({**values, "pointId": point_id, "lat": lat, "lon": lon})
    return rows, crs, [name for name, _ in fields]


def coordinate(row, lat_key, lon_key):
    if str(row.get(lat_key, "")).strip() == "" or str(row.get(lon_key, "")).strip() == "":
        return None, "missingCoordinates"
    try:
        lat, lon = float(row[lat_key]), float(row[lon_key])
    except (ValueError, TypeError):
        return None, "invalidCoordinates"
    if (
        not math.isfinite(lat)
        or not math.isfinite(lon)
        or not (33 <= lat <= 39 and 124 <= lon <= 132)
    ):
        return None, "invalidCoordinates"
    return (lat, lon), None


def positive(value):
    try:
        return int(value) > 0
    except (ValueError, TypeError):
        return None


def yes_no(value):
    return "yes" if value == "Y" else "no" if value == "N" else "unknown"


def stable_id(source_id, row, name, address, lat, lon):
    supplied_id = row.get("데이터 코드") or row.get("연번")
    if supplied_id:
        return f"{source_id}:{supplied_id}"
    identity = json.dumps([name, address, lat, lon], ensure_ascii=False, separators=(",", ":"))
    return f"{source_id}:{hashlib.sha256(identity.encode()).hexdigest()[:20]}"


def normalize():
    records = []
    sources = []
    quality = {}
    for source_id, config in SOURCE_CONFIG.items():
        path = RAW / config["file"]
        fetched = fetched_at(path)
        rows, crs, fields = (
            read_busan(path)
            if source_id == "kr-busan-galmatgil"
            else (
                read_csv(path),
                "WGS84 latitude/longitude columns",
                None,
            )
        )
        if fields is None:
            fields = list(rows[0])
        stats = {
            "rawRows": len(rows),
            "missingCoordinates": 0,
            "invalidCoordinates": 0,
            "duplicateFeaturesCollapsed": 0,
            "conflictingHours": 0,
            "conflictingAccess": 0,
            "acceptedRecords": 0,
            "excludedRows": [],
        }
        grouped = defaultdict(list)
        for number, row in enumerate(rows, 1):
            jeju = source_id == "kr-jeju-city"
            busan = source_id == "kr-busan-galmatgil"
            point, error = coordinate(
                row,
                "lat" if busan else "위도 좌표" if jeju else "위도",
                "lon" if busan else "경도 좌표" if jeju else "경도",
            )
            if error:
                stats[error] += 1
                stats["excludedRows"].append(
                    {"row": number, "id": row.get("데이터 코드"), "reason": error}
                )
                continue
            lat, lon = point
            name = row.get("이름") or row.get("명칭") or row.get("화장실 명") or row.get("화장실명")
            kind = row.get("구분") or row.get("구분 명") or ""
            name = (
                name.strip()
                if name
                else f"{kind or '공중화장실'} {row.get('데이터 코드') or number}"
            )
            address = (
                row.get("도로명")
                or row.get("도로명주소")
                or row.get("도로명 주소")
                or row.get("소재지주소")
                or row.get("지번주")
                or row.get("지번주소")
                or row.get("지번 주소")
                or ""
            )
            id_ = stable_id(source_id, row, name, address, lat, lon)
            hours = row.get("이용가") or row.get("개방 시간 정보") or row.get("개방시간") or ""
            access = (
                "public_by_agreement"
                if "개방" in kind
                else "public"
                if "공중" in kind or "간이" in kind
                else "unknown"
            )
            toilet = {
                "id": id_,
                "region": config["region"],
                "country": "KR",
                "sourceId": source_id,
                "name": name,
                "address": address.strip(),
                "lat": lat,
                "lon": lon,
                "access": access,
                "fee": "unknown",
                "wheelchair": "unknown",
                "changingTable": "unknown",
                "infantEquipment": "unknown",
                "male": None,
                "female": None,
                "unisex": None,
                "entranceNote": kind,
                "hoursRaw": hours.strip(),
                "timezone": "Asia/Seoul",
                "sourceUpdatedAt": row.get("데이터 기준일")
                or row.get("데이터기준일자")
                or config["edition"],
                "fetchedAt": fetched,
                "coordinateQuality": "source_position",
            }
            unisex = row.get("남녀공") or row.get("남녀 공용 화장실 여부")
            toilet["unisex"] = True if unisex == "Y" else False if unisex == "N" else None
            if jeju:
                toilet["changingTable"] = yes_no(row.get("기저귀 교환대 설치 여부"))
                toilet["male"] = positive(row.get("남성 대변기 수"))
                toilet["female"] = positive(row.get("여성 대변기 수"))
                counts = [
                    positive(row.get(key))
                    for key in [
                        "남성 장애인 대변기 수",
                        "남성 장애인 소변기 수",
                        "여성 장애인 대변기 수",
                    ]
                ]
                # Accessible cubicles do not establish step-free access to the building.
                toilet["entranceNote"] += (
                    "；來源提供無障礙便器："
                    + (
                        "有"
                        if True in counts
                        else "無"
                        if all(value is False for value in counts)
                        else "未知"
                    )
                    + "，入口無障礙未提供。"
                )
            grouped[id_].append(toilet)
        accepted = []
        for duplicates in grouped.values():
            toilet = duplicates[0]
            stats["duplicateFeaturesCollapsed"] += len(duplicates) - 1
            hours = {record["hoursRaw"] for record in duplicates}
            if len(hours) > 1:
                stats["conflictingHours"] += 1
                toilet["hoursRaw"] = ""
                toilet["entranceNote"] += (
                    "；來源重複紀錄的開放時間不一致，請現場確認（"
                    + "／".join(sorted(hours))
                    + "）。"
                )
            if len({record["access"] for record in duplicates}) > 1:
                stats["conflictingAccess"] += 1
                toilet["access"] = "unknown"
            accepted.append(toilet)
        stats["acceptedRecords"] = len(accepted)
        if stats["rawRows"] != sum(
            stats[key]
            for key in [
                "missingCoordinates",
                "invalidCoordinates",
                "duplicateFeaturesCollapsed",
                "acceptedRecords",
            ]
        ):
            raise ValueError("Quality counts do not reconcile")
        quality[source_id] = stats
        records.extend(accepted)
        sources.append(
            {
                "id": source_id,
                "country": "KR",
                "name": config["name"],
                "url": config["url"],
                "license": "利用許諾範圍無限制 · " + config["name"],
                "licenseUrl": POLICY,
                "fetchedAt": fetched,
                "sourceUpdatedAt": config["edition"],
                "catalogUpdatedAt": config["catalogUpdatedAt"],
                "count": len(accepted),
                "rawCount": len(rows),
                "fields": fields,
                "crs": crs,
                "note": config["note"] + "來源基準日與目錄修改日不同，均不代表現場查核。",
            }
        )
    if len({record["id"] for record in records}) != len(records):
        raise ValueError("Duplicate IDs across official Korean sources")
    return {"records": records, "sources": sources, "quality": quality}


def main():
    result = normalize()
    (RAW / "normalized.json").write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    )
    evidence = []
    for source_id, config in SOURCE_CONFIG.items():
        path = RAW / config["file"]
        catalog = RAW / config["catalog"]
        if "이용허락범위 제한 없음" not in catalog.read_text():
            raise ValueError("Catalog no longer confirms unrestricted reuse")
        html = catalog.read_text()
        url = re.search(r'"contentUrl":\s*"([^"]+fileDownload[^\"]+)"', html)
        if source_id == "kr-busan-galmatgil":
            meta = json.loads((RAW / "busan-download-metadata.json").read_text())
            download = (
                "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId="
                + meta["atchFileId"]
                + "&fileDetailSn="
                + meta["fileDetailSn"]
                + "&insertDataPrcus=N"
            )
        else:
            if not url:
                raise ValueError("Official direct download URL not found")
            download = url[1]
        evidence.append(
            {
                "sourceId": source_id,
                "catalogUrl": config["url"],
                "downloadUrl": download,
                "file": config["file"],
                "fetchedAt": fetched_at(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "catalogSha256": hashlib.sha256(catalog.read_bytes()).hexdigest(),
                "catalogUpdatedAt": config["catalogUpdatedAt"],
                "sourceEditionDate": config["edition"],
                "licenseOriginal": "이용허락범위 제한 없음",
                "licenseUrl": POLICY,
                "privateApiKeyRequired": False,
                "encoding": "UTF-8 SHP/DBF" if source_id == "kr-busan-galmatgil" else "CP949 CSV",
                "quality": result["quality"][source_id],
            }
        )
    (RAW / "evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    rows, _, _ = read_busan(RAW / "busan-galmatgil.zip")
    (RAW / "busan-point-fields.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        json.dumps(
            {source["id"]: result["quality"][source["id"]] for source in result["sources"]},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
