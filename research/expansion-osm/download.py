"""Fetch nationwide amenity=toilets snapshots without API credentials.

The inherited proxy and CA settings remain intact. Requests are sequential and
bounded; a second endpoint is used only after a recorded failure. Raw responses
stay in ignored data/raw/expansion-osm, while provenance and exact queries remain
reviewable in research/expansion-osm.
"""

import argparse
import hashlib
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "research" / "expansion-osm"
RAW = ROOT / "data" / "raw" / "expansion-osm"
ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
LIMIT_BYTES = 64 * 1024 * 1024
RESTRICTED_ACCESS = {
    "private",
    "no",
    "customers",
    "permit",
    "members",
    "delivery",
    "restricted",
    "emergency",
    "destination",
}


def query(country):
    return (
        "[out:json][timeout:120][maxsize:268435456];\n"
        f'area["ISO3166-1"="{country}"]["admin_level"="2"]->.country;\n'
        'nwr["amenity"="toilets"](area.country);\n'
        "out center tags;\n"
    )


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def fetch(country, endpoint):
    q = query(country)
    request = urllib.request.Request(
        endpoint,
        data=urllib.parse.urlencode({"data": q}).encode(),
        headers={
            "User-Agent": "Relief-JP-KR-Toilet-Map/1.0 (bounded public-data research)",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    started = time.monotonic()
    attempt = {
        "country": country,
        "endpoint": endpoint,
        "startedAt": datetime.now(UTC).isoformat(),
        "querySha256": hashlib.sha256(q.encode()).hexdigest(),
    }
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            body = response.read(LIMIT_BYTES + 1)
            if len(body) > LIMIT_BYTES:
                raise ValueError("Response exceeds bounded 64 MiB research limit")
            attempt["httpStatus"] = response.status
        data = json.loads(body)
        if data.get("remark"):
            raise ValueError(f"Overpass incomplete query: {data['remark']}")
        elements = data.get("elements")
        if not isinstance(elements, list) or not elements:
            raise ValueError("Missing or empty nationwide elements")
        ids = [(element["type"], element["id"]) for element in elements]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate OSM source IDs in country response")
        invalid = [
            element["id"]
            for element in elements
            if element.get("tags", {}).get("amenity") != "toilets"
            or "lat" not in element.get("center", element)
            or "lon" not in element.get("center", element)
            or not all(
                isinstance(element.get("center", element).get(key), (int, float))
                and not isinstance(element.get("center", element).get(key), bool)
                and math.isfinite(element.get("center", element)[key])
                for key in ("lat", "lon")
            )
        ]
        if invalid:
            raise ValueError(f"Invalid amenity or coordinates: {invalid[:10]}")
        path = RAW / f"{country.lower()}.json"
        path.write_bytes(body)
        access = Counter(element.get("tags", {}).get("access", "unknown") for element in elements)
        fee = Counter(element.get("tags", {}).get("fee", "unknown") for element in elements)
        blocked = RESTRICTED_ACCESS
        attempt.update(
            status="success",
            fetchedAt=datetime.now(UTC).isoformat(),
            bytes=len(body),
            sha256=hashlib.sha256(body).hexdigest(),
            rawPath=str(path.relative_to(ROOT)),
            count=len(elements),
            elementTypes=dict(Counter(element["type"] for element in elements)),
            accessTags=dict(access),
            feeTags=dict(fee),
            excludedExplicitAccess=sum(count for key, count in access.items() if key in blocked),
            recommendedWithoutExplicitRestrictions=sum(
                count for key, count in access.items() if key not in blocked
            ),
            timestampOsmBase=data.get("osm3s", {}).get("timestamp_osm_base"),
            timestampAreasBase=data.get("osm3s", {}).get("timestamp_areas_base"),
            bbox={
                "south": min(element.get("center", element)["lat"] for element in elements),
                "north": max(element.get("center", element)["lat"] for element in elements),
                "west": min(element.get("center", element)["lon"] for element in elements),
                "east": max(element.get("center", element)["lon"] for element in elements),
            },
            license="Open Database License (ODbL) 1.0",
            attribution="© OpenStreetMap contributors",
            licenseUrl="https://www.openstreetmap.org/copyright",
            note=(
                "Country administrative-area query, not limited to capitals. OSM completeness "
                "varies locally; amenity does not prove present access or free entry. Retain "
                "unknown access/fee and exclude explicitly restricted access."
            ),
        )
    except urllib.error.HTTPError as error:
        body = error.read(64 * 1024)
        attempt.update(
            status="failed",
            httpStatus=error.code,
            error=body.decode("utf-8", errors="replace")[:6000],
        )
    except (OSError, ValueError, KeyError) as error:
        attempt.update(status="failed", error=str(error))
    attempt["elapsedSeconds"] = round(time.monotonic() - started, 2)
    return attempt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("countries", nargs="*", default=["JP", "KR"], choices=["JP", "KR"])
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    RESEARCH.mkdir(parents=True, exist_ok=True)
    attempts_path = RESEARCH / "attempts.json"
    attempts = json.loads(attempts_path.read_text()) if attempts_path.exists() else []
    for country in args.countries:
        (RESEARCH / f"{country.lower()}.overpassql").write_text(query(country))
        for endpoint in ENDPOINTS:
            print(f"Fetching {country} nationwide from {endpoint}", flush=True)
            attempt = fetch(country, endpoint)
            attempts.append(attempt)
            write_json(attempts_path, attempts)
            print(json.dumps(attempt, ensure_ascii=False), flush=True)
            if attempt["status"] == "success":
                write_json(RESEARCH / f"{country.lower()}.metadata.json", attempt)
                break
        else:
            raise SystemExit(f"All bounded nationwide attempts failed for {country}")


if __name__ == "__main__":
    main()
