"""Count nearby OSM toilets for major-city coverage evidence.

These are 25 km geodesic-radius checks around city centers, not municipal-boundary
counts or a claim that every physical toilet is mapped. Nationwide source data
remains available outside these representative cities.
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "expansion-osm"
RESEARCH = ROOT / "research" / "expansion-osm"
RADIUS_KM = 25
RESTRICTED = {
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
CITIES = {
    "JP": [
        ("札幌", 43.0618, 141.3545),
        ("旭川", 43.7706, 142.3650),
        ("函館", 41.7687, 140.7288),
        ("青森", 40.8222, 140.7474),
        ("盛岡", 39.7019, 141.1543),
        ("仙台", 38.2682, 140.8694),
        ("秋田", 39.7200, 140.1024),
        ("山形", 38.2554, 140.3396),
        ("福島", 37.7608, 140.4747),
        ("東京", 35.6762, 139.6503),
        ("橫濱", 35.4437, 139.6380),
        ("千葉", 35.6074, 140.1065),
        ("埼玉", 35.8617, 139.6455),
        ("宇都宮", 36.5551, 139.8824),
        ("前橋", 36.3895, 139.0634),
        ("水戶", 36.3659, 140.4712),
        ("新潟", 37.9161, 139.0364),
        ("長野", 36.6486, 138.1948),
        ("松本", 36.2380, 137.9720),
        ("甲府", 35.6621, 138.5682),
        ("靜岡", 34.9756, 138.3828),
        ("濱松", 34.7108, 137.7261),
        ("名古屋", 35.1815, 136.9066),
        ("岐阜", 35.4233, 136.7607),
        ("富山", 36.6953, 137.2113),
        ("金澤", 36.5613, 136.6562),
        ("福井", 36.0641, 136.2196),
        ("津", 34.7186, 136.5055),
        ("京都", 35.0116, 135.7681),
        ("大阪", 34.6937, 135.5023),
        ("神戶", 34.6901, 135.1955),
        ("奈良", 34.6851, 135.8049),
        ("大津", 35.0178, 135.8546),
        ("和歌山", 34.2305, 135.1708),
        ("岡山", 34.6551, 133.9195),
        ("廣島", 34.3853, 132.4553),
        ("鳥取", 35.5011, 134.2351),
        ("松江", 35.4681, 133.0484),
        ("山口", 34.1785, 131.4737),
        ("德島", 34.0703, 134.5548),
        ("高松", 34.3428, 134.0466),
        ("松山", 33.8392, 132.7657),
        ("高知", 33.5597, 133.5311),
        ("福岡", 33.5902, 130.4017),
        ("北九州", 33.8835, 130.8754),
        ("佐賀", 33.2635, 130.3009),
        ("長崎", 32.7503, 129.8777),
        ("熊本", 32.8032, 130.7079),
        ("大分", 33.2396, 131.6093),
        ("宮崎", 31.9077, 131.4202),
        ("鹿兒島", 31.5966, 130.5571),
        ("那霸", 26.2124, 127.6809),
    ],
    "KR": [
        ("首爾", 37.5665, 126.9780),
        ("釜山", 35.1796, 129.0756),
        ("仁川", 37.4563, 126.7052),
        ("大邱", 35.8714, 128.6014),
        ("大田", 36.3504, 127.3845),
        ("光州", 35.1595, 126.8526),
        ("蔚山", 35.5384, 129.3114),
        ("世宗", 36.4800, 127.2890),
        ("水原", 37.2636, 127.0286),
        ("城南", 37.4200, 127.1265),
        ("高陽", 37.6584, 126.8320),
        ("龍仁", 37.2411, 127.1776),
        ("清州", 36.6424, 127.4890),
        ("全州", 35.8242, 127.1480),
        ("昌原", 35.2281, 128.6811),
        ("天安", 36.8151, 127.1139),
        ("平澤", 36.9921, 127.1127),
        ("金海", 35.2285, 128.8894),
        ("浦項", 36.0190, 129.3435),
        ("慶州", 35.8562, 129.2247),
        ("春川", 37.8813, 127.7298),
        ("原州", 37.3422, 127.9202),
        ("江陵", 37.7519, 128.8761),
        ("束草", 38.2070, 128.5918),
        ("麗水", 34.7604, 127.6622),
        ("順天", 34.9506, 127.4872),
        ("木浦", 34.8118, 126.3922),
        ("晉州", 35.1800, 128.1076),
        ("濟州", 33.4996, 126.5312),
        ("西歸浦", 33.2541, 126.5601),
    ],
}


def distance_km(lat1, lon1, lat2, lon2):
    latitude1, latitude2 = math.radians(lat1), math.radians(lat2)
    latitude_delta = latitude2 - latitude1
    longitude_delta = math.radians(lon2 - lon1)
    value = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(latitude1) * math.cos(latitude2) * math.sin(longitude_delta / 2) ** 2
    )
    return 6371.0088 * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0, 1 - value)))


def main():
    report = {
        "radiusKm": RADIUS_KM,
        "note": "Nearby counts within a city-center radius; not official municipal boundaries.",
        "cities": [],
    }
    for country, cities in CITIES.items():
        elements = json.loads((RAW / f"{country.lower()}.json").read_text())["elements"]
        eligible = [
            element
            for element in elements
            if element.get("tags", {}).get("access", "unknown") not in RESTRICTED
        ]
        for name, lat, lon in cities:
            nearby = [
                element
                for element in eligible
                if distance_km(
                    lat,
                    lon,
                    element.get("center", element)["lat"],
                    element.get("center", element)["lon"],
                )
                <= RADIUS_KM
            ]
            row = {"country": country, "name": name, "lat": lat, "lon": lon, "count": len(nearby)}
            report["cities"].append(row)
    report["checkedCities"] = len(report["cities"])
    report["citiesWithSourceData"] = sum(city["count"] > 0 for city in report["cities"])
    (RESEARCH / "coverage.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
