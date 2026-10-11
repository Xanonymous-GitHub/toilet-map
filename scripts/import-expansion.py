"""Merge verified nationwide OSM and local official snapshots, preserving unknowns.

Run after obtaining the raw snapshots using research/expansion-*/ tools. Existing
tracked nationwide snapshots are a reproducible offline fallback. No geocoding.
"""

import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGIONS = json.loads((ROOT / "data/regions.json").read_text())
RESTRICTED = {"private", "customers", "permit"}


def nearest_city(country, lat, lon):
    cities = ((key, city) for key, city in REGIONS.items() if city["country"] == country)
    return min(
        cities,
        key=lambda item: (
            (lat - item[1]["center"][1]) ** 2
            + ((lon - item[1]["center"][0]) * math.cos(math.radians(lat))) ** 2
        ),
    )[0]


def access(value):
    if value in {"yes", "public", "permissive"}:
        return "public"
    if value in {"no", "private"}:
        return "private"
    if value == "customers":
        return "customers"
    if value in {"permit", "members", "delivery", "restricted", "emergency", "destination"}:
        return "permit"
    return "unknown"


def known(value):
    return value if value in {"yes", "no", "limited"} else "unknown"


def normalize_osm(country, raw, meta):
    result = []
    for row in raw["elements"]:
        tags = row.get("tags", {})
        point = row.get("center", row)
        lat, lon = point["lat"], point["lon"]
        if tags.get("amenity") != "toilets" or not all(map(math.isfinite, [lat, lon])):
            raise ValueError("Invalid OSM amenity or coordinates")
        if not (20 <= lat <= 46.5 and 122 <= lon <= 147):
            raise ValueError("OSM coordinates outside national sanity bounds")
        if country == "KR" and not (33 <= lat <= 39 and 124 <= lon <= 132):
            raise ValueError("OSM coordinates outside Korea")
        region = nearest_city(country, lat, lon)
        address = tags.get("addr:full") or " ".join(
            str(tags[key])
            for key in ["addr:city", "addr:street", "addr:housenumber"]
            if tags.get(key)
        )
        notes = [tags.get("description", "")]
        if tags.get("fee") and known(tags["fee"]) == "unknown":
            notes.append("費用來源值：" + tags["fee"])
        result.append(
            {
                "id": f"osm:{row['type']}:{row['id']}",
                "region": region,
                "country": country,
                "sourceId": "osm-" + country.lower(),
                "name": tags.get("name") or "廁所（名稱未提供）",
                "nameEn": tags.get("name:en", ""),
                "address": address,
                "lat": lat,
                "lon": lon,
                "access": access(tags.get("access")),
                "fee": known(tags.get("fee")),
                "wheelchair": known(tags.get("wheelchair")),
                "changingTable": known(tags.get("changing_table")),
                "infantEquipment": "unknown",
                "male": {"yes": True, "no": False}.get(tags.get("male")),
                "female": {"yes": True, "no": False}.get(tags.get("female")),
                "unisex": {"yes": True, "no": False}.get(tags.get("unisex")),
                "entranceNote": "；".join(note for note in notes if note),
                "hoursRaw": tags.get("opening_hours", ""),
                "timezone": "Asia/Tokyo" if country == "JP" else "Asia/Seoul",
                "sourceUpdatedAt": None,
                "fetchedAt": meta["fetchedAt"],
                "coordinateQuality": "source_position" if row["type"] == "node" else "osm_center",
            }
        )
    return result


def finalize(records, sources):
    records = sorted(records, key=lambda row: row["id"])
    ids = [row["id"] for row in records]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source IDs across snapshots")
    source_counts = Counter(row["sourceId"] for row in records)
    for source in sources:
        if source["count"] != source_counts[source["id"]]:
            raise ValueError("Source counts do not reconcile: " + source["id"])
    if set(source_counts) != {source["id"] for source in sources}:
        raise ValueError("Missing source provenance")
    eligible = [row for row in records if row["access"] not in RESTRICTED]
    countries = {
        country: sum(row["country"] == country for row in eligible) for country in ["JP", "KR"]
    }
    counts = {}
    for id_, city in REGIONS.items():
        west, south, east, north = city["bounds"]
        counts[id_] = sum(
            row["country"] == city["country"]
            and west <= row["lon"] <= east
            and south <= row["lat"] <= north
            for row in eligible
        )
    if any(count == 0 for count in counts.values()):
        raise ValueError("A listed city has no positioned candidates")
    version_input = {"records": records, "sources": sources, "regions": REGIONS}
    digest = hashlib.sha256(json.dumps(version_input, ensure_ascii=False, sort_keys=True).encode())
    return {
        "dataVersion": "v" + digest.hexdigest()[:12],
        "fetchedAt": max(source["fetchedAt"] for source in sources),
        "records": records,
        "sources": sources,
        "coverage": {
            "countries": countries,
            "cityCounts": counts,
            "total": len(eligible),
            "rawTotal": len(records),
            "excludedAccess": len(records) - len(eligible),
            "cities": len(counts),
            "note": "城市及周邊矩形查詢範圍會重疊，並非行政市界；"
            "來源點位不保證完整，同設施跨來源可能重複。",
        },
    }


def main():
    published = json.loads((ROOT / "data/dataset.json").read_text())
    records = [row for row in published["records"] if not row["sourceId"].startswith("osm-")]
    sources = [source for source in published["sources"] if not source["id"].startswith("osm-")]
    for country in ["JP", "KR"]:
        key = country.lower()
        local = ROOT / f"data/raw/expansion-osm/{key}.json"
        tracked = ROOT / f"data/osm-{key}.json"
        raw_bytes = (local if local.exists() else tracked).read_bytes()
        raw = json.loads(raw_bytes)
        meta = json.loads((ROOT / f"research/expansion-osm/{key}.metadata.json").read_text())
        if hashlib.sha256(raw_bytes).hexdigest() != meta["sha256"]:
            raise ValueError("OSM snapshot digest differs from its provenance")
        normalized = normalize_osm(country, raw, meta)
        if len(normalized) != meta["count"]:
            raise ValueError("OSM row-count loss")
        records.extend(normalized)
        sources.append(
            {
                "id": "osm-" + key,
                "country": country,
                "name": "OpenStreetMap・" + ("日本" if country == "JP" else "韓國"),
                "url": "https://www.openstreetmap.org/copyright",
                "license": "ODbL 1.0 · © OpenStreetMap contributors",
                "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
                "fetchedAt": meta["fetchedAt"],
                "sourceUpdatedAt": None,
                "count": len(normalized),
                "note": "全國行政區查詢的來源點位，含鄉村及離島；各地完整度不同。OSM 資料庫快照 "
                + meta["timestampOsmBase"]
                + " 不代表現場查核；way／relation 是幾何中心。"
                "私有、限顧客及其他明示限制不列入推薦，未知資訊保留未知。",
            }
        )
        tracked.write_bytes(raw_bytes)
    official_path = ROOT / "data/raw/expansion-korea/normalized.json"
    if official_path.exists():
        official = json.loads(official_path.read_text())
        source_ids = {source["id"] for source in official["sources"]}
        records = [row for row in records if row["sourceId"] not in source_ids]
        sources = [source for source in sources if source["id"] not in source_ids]
        for row in official["records"]:
            row["region"] = nearest_city("KR", row["lat"], row["lon"])
        records.extend(official["records"])
        sources.extend(official["sources"])
        (ROOT / "docs/official-data-quality.json").write_text(
            json.dumps(official["quality"], ensure_ascii=False, indent=2) + "\n"
        )
    # Keep provenance order stable when optional local snapshots are absent.
    source_order = {source["id"]: index for index, source in enumerate(published["sources"])}
    sources.sort(
        key=lambda source: (source_order.get(source["id"], len(source_order)), source["id"])
    )
    result = finalize(records, sources)
    temp = ROOT / "data/dataset.tmp"
    temp.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(temp, ROOT / "data/dataset.json")
    (ROOT / "docs/coverage.json").write_text(
        json.dumps(result["coverage"], ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(result["coverage"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
