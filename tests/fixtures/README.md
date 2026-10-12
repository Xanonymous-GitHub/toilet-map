# Browser basemap fixtures

UI and offline checks use the retained 256 × 256 `basemap.png` raster fixture.
OSM requests are intercepted only in fixture tests; toilet data, API, MapLibre,
Worker and PWA assets come from the production build. Live-provider checks use
native Chromium requests to the official tile URL with verified TLS and inspect
its Referer and HTTP status.

Map data: © OpenStreetMap contributors, ODbL 1.0.

The historical OpenFreeMap JSON and PBF fixtures remain for comparisons with
previous vector-map reports. Their style licenses are documented at
https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md.
