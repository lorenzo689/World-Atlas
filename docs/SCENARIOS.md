# Scenario boundaries and territorial control

The public landing page opens the present-day atlas through **Explore now**. The atlas links to a scenario menu. Each selection mounts a new explorer with its own local state. Account and learning pages remain accessible through the product navigation.

| Scenario | Years | Tools | Territorial areas |
| --- | --- | --- | --- |
| Today | Present day | Modern search, satellite/political/data modes, current conflict briefs, saved views | Dated VIINA settlement-control estimates for Ukraine |
| Changing borders | 1886–2019 | Historical search, timeline, guided lessons, synchronized year comparison | Available occupation snapshots for the exact selected year; missing years remain unshaded |
| World War I | 1914–1918 | Historical search, annual war overview, sourced events, satellite/political modes | Selected occupation areas in Belgium, northeastern France, Luxembourg and Serbia |
| World War II | 1939–1945 | Historical search, seven war moments, theater/event/front controls, satellite/political modes | Selected European occupation areas, sourced sections of the Eastern Front, and selected Allied advances in Germany |

## Routing and isolation

`frontend/src/lib/scenarios.ts` defines the supported modes, capabilities and year limits. Canonical routes are `/explore?scenario=today`, `/explore?scenario=borders&year=1991`, `/explore?scenario=ww1&year=1916` and `/explore?scenario=ww2&year=1942`. Existing `year`, `compare`, `ww1` and `ww2` links remain supported. Explicit scenario IDs take precedence over legacy flags. Invalid years normalize to the scenario's first supported year; comparison parameters are discarded outside Changing borders.

Changing presentation mode never changes scenario. Closing a war view returns to the scenario menu. The global timeline and historical comparison tools only appear in Changing borders. Today has no historical timeline; historical scenarios cannot activate current indicator or conflict layers. The current-conflict API is not called from historical scenarios. WWII territory areas respect the selected theater; the current historical dataset has no verified area coverage outside Europe.

Shared personal atlas views open Today with `restore=1`, preserving their saved camera, metric and selection. This parameter restores local application state; it does not grant authentication or access to private views.

## What the territory layer means

Territorial control is independent of sovereign borders. Each feature carries an actor, status (occupation, control or contested), source URL, exact snapshot date, license and precision. Actor checkboxes control visibility. Selecting a colored area opens its attribution; selecting an attribution focuses the camera. Borders remain visible beneath/above the translucent area layer.

**Coverage is explicitly partial.** No layer claims to show all occupations or all actors worldwide. An unshaded location means that this dataset makes no control claim there. Current coverage is Ukraine; a date in the source is displayed instead of a claim of live control. Territorial claims, legal sovereignty, occupation and reported military control must not be treated as interchangeable.

Current areas are derived from VIINA 2.0 `status_boost` observations and GeoNames settlement tessellation. Unknown cells are excluded. The displayed snapshot is the latest observed date at or before the generation cutoff. Tessellation and topology simplification make these estimated control areas, not surveyed or live tactical fronts. VIINA is distributed under ODbL 1.0; the product includes source attribution and license links.

Historical areas are **original schematic regional reconstructions**, clipped against pre-war CShapes footprints. Internal zone boundaries are generalized. They are not independently validated GIS occupation boundaries and do not encode every enclave, liberation, administration or movement within a year. The historical base map retains its separate January 1 state; area dates and event dates are shown independently. WWI uses year-end snapshots for 1914–1917 and May 1 for 1918. WWII areas use the existing seven dated war moments. German/allied Eastern Front areas close only within the latitude band of the cited front section; they do not extrapolate a complete front to the north or south. Pre-war borders exclude home territory from those occupation areas. German and allied forces are grouped where the regional reconstruction does not resolve their separate administration.

The historical product inherits CShapes' **CC BY-NC-SA 4.0** terms. It is not licensed for unrestricted commercial reuse. The generation script pins the CShapes input checksum and records it in the output. Museum and archive pages provide evidence; their images are linked, not redistributed.

References include the [Truman Library Western Front map](https://www.trumanlibrary.gov/maps/m1932-map-western-front), [West Point campaign atlas](https://dhc.westpoint.edu/atlases/), [USHMM occupation maps](https://encyclopedia.ushmm.org/content/en/gallery/german-occupation-maps), and the dated primary maps already linked by the WWII learning moments. [VIINA](https://github.com/zhukovyuri/VIINA) documents the modern control estimates.

## Generation, performance and verification

Run from `frontend`:

```sh
npm run data:conflicts        # Fetch/cache VIINA; generate lines and controller polygons
npm run data:territories     # Build historical areas from the pinned CShapes source cache
npm test                    # Includes route policy, provenance, time isolation and polygon picking
npm run build
npm run smoke:scenarios      # Browser with a running app; override SMOKE_URL and CHROME_PATH
```

The historical generator requires `scripts/source/historical/CShapes-2.0.geojson`, populated by the existing history generator. Source caches are ignored by Git; generated JSON is committed. The Pages workflow refreshes VIINA at build time and retains the last committed dated product if upstream access fails. It also runs the scenario browser check.

JSON loads on demand. Triangulation runs in cancellable Web Workers. A four-snapshot cache bounds prepared geometry. Changing the year immediately removes old geometry; unsupported years never reuse a previous front. Per-feature GPU geometry is reused for visibility changes and disposed when its snapshot is replaced or the globe is destroyed. Areas render in a small number of draw calls; no per-frame polygon triangulation or React rendering is added. Geographic picking runs on clicks only, preserving holes and actor filters. When occupation areas are enabled in year comparison, territorial gain/loss fills are suppressed to avoid mixing two meanings of area color; difference lines remain available.

Unit checks validate every shipped feature and distinguish occupation abroad from an actor's home territory. Browser coverage checks scenario capabilities, legacy/invalid query normalization, worker output, actor filters, theater isolation, source links, unavailable years and a mobile viewport. Production builds are checked separately from browser behavior.
