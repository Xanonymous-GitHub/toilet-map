# Nationwide OpenStreetMap coverage

The country administrative-area queries succeeded sequentially on the public
HTTPS endpoint `https://overpass-api.de/api/interpreter`. No key or account was
used, and the inherited proxy and CA verification remained enabled. No fallback
endpoint or city-by-city network query was needed.

| Country | Source entries | Excluded restricted access | Eligible including unknown access | OSM snapshot (UTC) |
| --- | ---: | ---: | ---: | --- |
| Japan | 32,264 | 1,218 | 31,046 | 2026-10-11 12:39:16 |
| South Korea | 5,406 | 32 | 5,374 | 2026-10-11 12:41:21 |

Japan includes nodes, ways and relations from Okinawa to Hokkaido. South Korea
includes Jeju and island records. Country selection uses OSM administrative
areas with `ISO3166-1` equal to `JP` / `KR` and `admin_level=2`; it is not a query
limited to capitals or the city list. Untagged toilets and missing OSM features
remain absent, so these counts do not represent all physical public toilets.

Both snapshots have finite coordinates, unique OSM IDs, the expected amenity
tag, matching SHA-256 digests, and centers within coarse expected country
extents. There are no shared IDs between countries and no contradictory
explicit `addr:country` tags. This sanity check does not certify every center
against a detailed country polygon; way/relation centers remain approximate.

All 82 representative city-center radius checks contain source data: 52 in
Japan (including all 47 prefectural capitals) and 30 in South Korea. Counts in
`coverage.json` use a 25 km geodesic radius after excluding explicit access
restrictions. They can overlap nearby cities and are not municipal counts.
Production city/bbox counts should be calculated from the exact application
selection bounds rather than presented as these radius counts.

Reviewable files:

- `jp.overpassql`, `kr.overpassql`: exact country queries.
- `jp.metadata.json`, `kr.metadata.json`: counts, endpoint, source timestamps,
  raw snapshot digest, coordinate extent, access/fee distributions and license.
- `attempts.json`: bounded sequential request evidence.
- `validation.json`: finite-coordinate, identity, extent and digest checks.
- `access-mapping.json`: conservative normalization and date semantics.
- `coverage.json`: nearby source counts for representative cities.
- `download.py`, `coverage.py`: reproducible standard-library acquisition and
  offline coverage analysis; both pass the project's Ruff checks.

Raw snapshots are intentionally ignored by Git:
`data/raw/expansion-osm/jp.json` (6,024,140 bytes) and
`data/raw/expansion-osm/kr.json` (1,107,281 bytes). They preserve original OSM IDs,
tags, node/way/relation types, geometry centers and response snapshot timestamps.

```sh
# Network refresh: only when a new snapshot is intentionally required.
python research/expansion-osm/download.py JP KR

# Offline repeat of city-radius counts; no Overpass requests.
python research/expansion-osm/coverage.py
```

Missing access, fee, opening hours or accessibility must remain unknown.
Private, customer-only, permit, membership and other explicit restrictions must
be excluded from recommendations. The nationwide snapshots themselves retain
these records for an auditable import. OSM database snapshot dates do not mean
the individual toilet has been inspected or updated on that date. Attribution
is `© OpenStreetMap contributors`, licensed under ODbL 1.0;
see <https://www.openstreetmap.org/copyright>.
