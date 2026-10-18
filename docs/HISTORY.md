# Historical viewer

The globe has two map timelines:

- **History, 1886–2019:** one selectable year per step, representing **1 January** of that year.
  The active country-periods, borders and names come from CShapes 2.0. The political map is
  deliberately separate from the World Bank indicator timeline.
- **Today:** the existing Natural Earth map and current country metadata.

Modern 1:10m close-zoom borders, administrative lines, physical details and place labels are disabled
for historical years. They cannot be safely projected onto dated CShapes states. The satellite
texture is January 2004 imagery used as a visual background, not a dated land-cover layer.

The comparison control shows two selected snapshots side by side. Rose lines show removed boundary
segments; teal lines show added segments. Translucent areas show geometric losses and gains for
states present in both snapshots. A Web Worker computes the polygon difference, debounced while
scrubbing and cached for recent year pairs. New or dissolved states are listed as entity changes
rather than coloring their entire footprint as a territorial gain or loss. The right globe follows
the left camera. Four guided lessons explain selected transitions, focus the map and ask a question;
each links to a primary source. A copied URL includes `year` and `compare`
parameters, so the same view opens on the GitHub Pages demo without an account.

The **Conflicts** control switches to Today and opens five source-dated regional learning points.
Selecting a point in the list or on the globe shows context, a question and the underlying UN
report. This is an editorial selection, not a complete conflict registry. Markers are approximate
regional anchors, not battle sites, front lines, territorial control or safety advice. Each card
shows its source date and flags a report older than 60 days for review. Gaza is classified as a
fragile ceasefire, following the cited OCHA report.

There is no historical boundary source in this project for 2020–2025. The slider therefore ends
at 2019 and offers a separate Today button; it does not silently reuse today's borders for those
years. CShapes is a scholarly reconstruction. Territorial changes below the source's threshold,
wartime changes, dependent territories and disputed boundaries reflect its coding choices.

## Data pipeline

`npm run data:history` downloads the pinned CShapes GeoJSON from ETH Zurich if absent, checks its
SHA-256, and builds `public/data/historical-topology.json` plus a binary cache of pre-triangulated
country-period caps. The 26 MB upstream file is ignored by Git. A single 710-period TopoJSON stores
shared boundaries; the browser selects valid periods and copies their precomputed geometry when a
year changes. It keeps the WebGL renderer, textures and camera alive. The geometry stores
per-period indices as unsigned 16-bit values and expands them on load, reducing the transferred
binary from 18,376,160 to 12,376,220 bytes. `historical-manifest.json` records source provenance,
license, schema and SHA-256 checksums. `npm run data:history:verify` checks annual coverage, dates,
geometry and generated files and runs in CI.

After `npm run build`, run `npm run preview -- --port 4173` and `npm run smoke:history` in separate
terminals to check the real browser interaction.

Flag timelines are derived from the CC0 [Wikimedia Commons FlagsData table](https://commons.wikimedia.org/wiki/Data:FlagsData.tab)
and a checked-in ISO-to-Wikidata mapping from [datasets/country-codes](https://github.com/datasets/country-codes).
The build script includes dated corrections for Germany, East Germany, Czechoslovakia,
Yugoslavia and Russia/the Soviet Union, whose CShapes identifiers span changes of state.
The Commons file for a selected state is loaded on demand. A flag is shown only if its source row
has a start date that covers the selected year; unknown historical flags are marked as unavailable.
The selected flag links to its Commons file page for its individual attribution and license.

**Boundary source and license:** Schvitz, Rüegger, Girardin, Cederman, Weidmann and Gleditsch,
“Mapping The International System, 1886–2017: The CShapes 2.0 Dataset,” *Journal of Conflict
Resolution* 66(1), 2022. [ETH source](https://icr.ethz.ch/data/cshapes/),
**CC BY-NC-SA 4.0**. The generated historical topology and geometry are adaptations of this data
and carry the same data license. Commercial reuse requires a different licensed boundary source.

Flag imagery is served by Wikimedia Commons and is not bundled. The historical globe geometry is
cached by the service worker after first load; Commons flags require a network connection.
