# Close-zoom map detail

The globe loads detail as the camera moves closer:

| Camera altitude | Geometry and imagery |
| --- | --- |
| World view | The existing compact Natural Earth 1:50m boundaries and 4K (2K on low-memory/touch devices) NASA texture. |
| Below 0.85 globe radii | Camera-local Natural Earth 1:10m border tiles. The original boundaries remain until every visible detailed border tile is ready. |
| Below 0.5 / 0.34 | Major rivers and lake outlines / first-level administrative borders and place labels, capped by distance. |
| Below 0.16 globe radii | Major roads and denser place labels near the camera. |
| Below 0.45, desktop satellite view | Camera-local native 1350px NASA image tiles over the 4K fallback texture. Mobile and low-memory devices keep the 2K base texture. |

The vector layer uses 12×6 geographic tiles. Each segment stores two endpoints as four signed 16-bit offsets in thousandths of a degree from the tile origin. `scripts/build-map-detail.mjs` writes one file per occupied tile and kind plus a manifest. Shared country arcs come from `world-atlas@2` Natural Earth 1:10m; admin-1 lines, rivers, lakes, major roads and place labels come from the pinned Natural Earth vector repository revision in the script. The source SHA-256 values are checked before a rebuild. No detailed vectors are fetched at world zoom. The browser fetches at most six tiles concurrently, decodes them in a Web Worker, renders each tile in one draw call, and keeps at most 40 decoded tiles cached. Camera-aware tile selection avoids offscreen requests. The visible set is capped at 18 border tiles and five per secondary kind on desktop; roads use four. Touch and low-memory devices use lower caps. The coarse borders and selection outlines disappear together when all visible 10m border tiles are loaded, avoiding double or offset lines.

The image source is NASA Earth Observatory's [January 2004 Blue Marble Next Generation with topography and bathymetry](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/), 21600×10800 pixels (2 km/pixel). `scripts/optimize-textures.mjs` checks its SHA-256, produces the 4K/2K base images and a 16×8 grid of native 1350px WebP tiles. The original is ignored by Git; generated web assets are checked in. Only the closest 12 image tiles are active, with four concurrent downloads and an 18-tile cache. The NASA source is a composite from 2004, not live satellite imagery. Its 2 km source pixels remain the limit for ground imagery at extreme zoom; roads and labels add detail without suggesting individual streets are visible in the image.

The historic 1886–2019 view intentionally disables modern high-resolution boundaries, administrative divisions, river/lake overlays, labels and image tiles. Its borders continue to come only from CShapes 2.0. The 4K NASA image remains a visual background, not a historical reconstruction of land cover.

GitHub Pages opens the static historical demo in 1989 and uses political mode. The browser smoke switches to **Today** to verify the modern vector detail there; the satellite image path is checked by the regular CI browser test.

## Rebuild and verify

```bash
npm ci
npm run data:detail                # pinned Natural Earth source; downloads if cache is absent
node scripts/optimize-textures.mjs # pinned NASA source; downloads if cache is absent
npm run data:detail:verify
npm run build
npm run smoke:detail              # real-browser check of lazy requests, labels and draw calls
```

The generated assets are repository totals, **not initial page transfer**. At world zoom, neither tile family is requested. The browser smoke checks stationary idle behavior, lazy downloads, atomic border switching, close-zoom roads and a maximum of 65 draw calls. Exact frame times depend on the viewer's GPU; use `npm run perf` on a real GPU to compare before and after changes.

Natural Earth is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). NASA imagery is sourced from the [NASA Earth Observatory](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/). Modern boundaries may differ from the historical CShapes coding or from administrative claims; the map is a visualization, not a legal boundary authority.
