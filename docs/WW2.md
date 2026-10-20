# World War II learning atlas

The historical timeline has a separate **World War II** learning view for 1939–1945. Open it from
the button below the timeline or through `?year=1944&ww2=1`. Each year is anchored to one explicit
date. Switching years does not interpolate or animate a military line through dates without evidence.

The view keeps three concepts separate:

1. **State/annexation borders** are the CShapes 2.0 reconstruction at **1 January** of the
   selected year, with a dated OpenHistoricalMap correction for German annexations in 1939–1945.
   The General Government and Czech Protectorate are excluded from that Reich footprint;
   the Free City of Danzig is mapped separately in 1939. These are neither an occupation map
   nor a military front. The OHM line work is approximate. See [HISTORY.md](HISTORY.md).
2. **Front sections** are small, original and deliberately coarse interpretations of the dated
   maps listed below, drawn in amber. They are not surveyed positions, tactical advice, complete
   fronts, or proof of control on either side of the line. The geometry is maintained in
   `frontend/src/lib/ww2.ts`, with a date, theater, source URL and `schematic` precision on every
   feature. We do not rehost or reproduce the reference maps.
3. **Occupation/control** needs independently validated polygons and clear definitions (annexed,
   occupied, client regime, contested). The current atlas does **not** draw this layer. A missing
   polygon or front is a data gap, not an assertion that a place was peaceful or unoccupied.

The year cards also include source-linked event locations and a question about interpretation.
Pacific naval and island operations are not forced into a fictitious continuous land front. The
human consequences are included so the view does not turn the war into a territory-scoring game.

## Coverage ledger

| Year | Map date | Currently drawn | Main geometry evidence | Known gap |
| --- | --- | --- | --- | --- |
| 1939 | 16 Sep | Warsaw-area schematic section | [U.S. Army Military Review](https://www.armyupress.army.mil/Portals/7/online-publications/documents/the-european-war-military-review-december-1939.pdf), situation map of 16 Sep | Rest of the Polish campaign and occupation polygons |
| 1940 | 4 Jun | Somme–Aisne schematic section | [U.S. Military Academy map](https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/01/WWIIEurope13.jpg) | Later June campaign, other theaters and occupation polygons |
| 1941 | 12 Nov | Broad Eastern Front schematic section | [U.S. Army CMH, Map 2](https://history.army.mil/portals/143/Images/Publications/catalog/30-12.pdf) | Pockets, local positions, other theaters and occupation polygons |
| 1942 | 18 Nov | Selected Eastern Front schematic section | [U.S. Army CMH, Map 17](https://history.army.mil/portals/143/Images/Publications/catalog/104-21.pdf) | North African line, Pacific operational geometries and occupation polygons |
| 1943 | 15 Dec | Broad Eastern Front schematic section | [U.S. Army Battle Fronts Atlas](https://commons.wikimedia.org/wiki/File:1943-12-15GerWW2BattlefrontAtlas.jpg) | Italy and other theaters, occupation polygons |
| 1944 | 15 Dec | Selected Western and Eastern sections | [U.S. Army Battle Fronts Atlas](https://commons.wikimedia.org/wiki/File:1944-12-15GerWW2BattlefrontAtlas.jpg) | Pockets, other theaters and occupation polygons |
| 1945 | 15 Apr | Selected Western and Eastern sections | [U.S. Army Battle Fronts Atlas](https://commons.wikimedia.org/wiki/File:1945-04-15GerWW2BattlefrontAtlas.jpg) | Final weeks, Asia/Pacific and occupation polygons |

These maps do **not** constitute a fully georeferenced atlas of all Second World War fronts.
The 1943–45 U.S. Army atlas offers half-monthly source images; the Library of Congress also has
daily Western Front situation maps from June 1944 to July 1945. Those are promising inputs for a
future reviewed digitization pipeline, but they have not been digitized in full here. The U.S.
Military Academy asks that reprint permission be requested for its maps; this project only links
to its map and does not bundle the image.

Before promoting a section from `schematic` to a detailed frontline, record a reference map's
date, projection, control points, digitizer/reviewer, uncertainty envelope, permission or public-
domain rationale, and a comparison with a second independent source. Do not infer the line at an
intermediate date from adjacent year snapshots. For occupation, validate categories separately;
the Stanford Spatial History Lab's monthly 1938–45 polygons chiefly record annexation, not
occupation or a complete military frontline, so they cannot simply fill this layer.

## Verification

From `frontend/`, run `npm test -- src/lib/__tests__/ww2.test.ts`, `npm run build`, and
`npm run smoke:ww2` against a running Vite or preview server. The browser check visits all seven
years, validates visible line geometry and switches theater filters. The historical smoke test
still verifies the independent CShapes comparison and the current-conflict view.
