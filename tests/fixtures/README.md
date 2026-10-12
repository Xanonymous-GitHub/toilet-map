# Browser basemap fixtures

UI checks use the non-symbol layers from OpenFreeMap's Positron and Dark styles,
with the unmodified water layer from a single fixed vector tile. Text, sprite patterns and remote URLs are omitted
from these fixtures to keep CI deterministic. Real-provider checks separately load
the actual styles, glyphs, sprites and currently viewed tiles with verified TLS.

Retrieved on 2026-10-12:

- Styles: https://tiles.openfreemap.org/styles/positron and https://tiles.openfreemap.org/styles/dark
- Vector tile: https://tiles.openfreemap.org/planet/20261004_113936_pt/7/113/50.pbf
- Style project and licenses: https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md
- Map data: © OpenStreetMap contributors, ODbL 1.0; schema © OpenMapTiles.

The historical PNG fixture remains for previously recorded raster-map comparisons.
