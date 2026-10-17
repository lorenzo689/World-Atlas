# Close-zoom map detail

The globe has three deliberate levels of detail:

| Camera altitude | Geometry and imagery |
| --- | --- |
| World view | The existing compact Natural Earth 1:50m boundaries and 4K (2K on low-memory/touch devices) NASA texture. |
| Below 0.85 globe radii | Camera-local Natural Earth 1:10m border tiles. The original boundaries remain until every visible detailed border tile is ready. |
| Below 0.5 / 0.34 | Major rivers and lake outlines / first-level administrative borders and place labels, capped by distance. |
| Below 0.55, desktop satellite view | Camera-local 1024px NASA image tiles over the 4K fallback texture. Mobile and low-memory devices keep the 2K base texture. |

The vector layer uses 12×6 geographic tiles. Each segment stores two endpoints as four signed 16-bit offsets in thousandths of a degree from the tile origin. `scripts/build-map-detail.mjs` writes one file per occupied tile and kind plus a manifest. Shared country arcs come from `world-atlas@2` Natural Earth 1:10m; admin-1 lines, rivers, lakes and place labels come from the pinned Natural Earth vector repository revision in the script. The source SHA-256 values are checked before a rebuild. No detailed vectors are fetched at world zoom. The browser fetches at most six tiles concurrently, decodes them in a Web Worker, renders each tile in one draw call, and keeps at most 40 decoded tiles cached. The visible set is capped at 18 border tiles and five tiles per secondary kind on desktop, or eight and two on touch/low-memory devices.

The image source is NASA Earth Observatory's [January 2004 Blue Marble Next Generation with topography and bathymetry](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/), 21600×10800 pixels (2 km/pixel). `scripts/optimize-textures.mjs` checks its SHA-256, produces the 4K/2K base images and a 16×8 grid of 1024px WebP tiles. The 29.7 MB original is ignored by Git; generated web assets are checked in. Only the closest 16 image tiles are active, with four concurrent downloads and a 24-tile cache. The NASA source is a composite from 2004, not live satellite imagery.

The historic 1886–2019 view intentionally disables modern high-resolution boundaries, administrative divisions, river/lake overlays, labels and image tiles. Its borders continue to come only from CShapes 2.0. The 4K NASA image remains a visual background, not a historical reconstruction of land cover.

## Rebuild and verify

```bash
npm ci
npm run data:detail                # pinned Natural Earth source; downloads if cache is absent
node scripts/optimize-textures.mjs # pinned NASA source; downloads if cache is absent
npm run data:detail:verify
npm run build
npm run smoke:detail              # real-browser check of lazy requests, labels and draw calls
```

The generated vector assets total about 7.2 MiB across 191 files; all 128 image tiles total about 8.2 MiB. These are repository totals, **not initial page transfer**. At world zoom, neither tile family is requested. The browser smoke checks this and a maximum of 65 close-zoom draw calls. Exact frame times depend on the viewer's GPU; use `npm run perf` on a real GPU to compare before and after changes.

Natural Earth is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). NASA imagery is sourced from the [NASA Earth Observatory](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/). Modern boundaries may differ from the historical CShapes coding or from administrative claims; the map is a visualization, not a legal boundary authority.
