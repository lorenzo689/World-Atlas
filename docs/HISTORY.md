# Historical viewer

The globe has two map timelines:

- **History, 1886–2019:** one selectable year per step, representing **1 January** of that year.
  The active country-periods, borders and names primarily come from CShapes 2.0; the
  1939–1945 German annexation footprints and Free City of Danzig use OpenHistoricalMap.
  The political map is deliberately separate from the World Bank indicator timeline.
- **Today:** the existing Natural Earth map and current country metadata.

## World War II German annexation geometry

CShapes alone is inconsistent for 1939–1945: its 1940 snapshot leaves Vienna in Austria,
Klaipėda in Lithuania, and Poznań in Poland, but includes Sudetenland and Danzig in Germany.
The build now replaces the German polygon at each 1 January snapshot from 1939 through 1945
with a dated [OpenHistoricalMap](https://www.openhistoricalmap.org/copyright) CC0 boundary
relation. The OHM parent relation also includes the *Generalgouvernement* and the
*Protektorat Böhmen und Mähren*; both are explicitly subtracted using their own dated
relations. CShapes country polygons are clipped against the replacement Reich polygon.
The Free City of Danzig is added for 1921–1939 (through its 1939 endpoint); it is not
part of the German 1 January 1939 polygon.

This is a reconstruction of **annexed/administratively incorporated territory**, not
military occupation or front-line control. Other European state changes not covered by
this correction still follow CShapes; the OHM relations themselves carry a “needs source
for boundary lines” note, so their fine-scale geometry is approximate. No exact surveying
accuracy is claimed. The [USHMM account](https://encyclopedia.ushmm.org/content/en/article/invasion-of-poland-fall-1939)
distinguishes annexed western Poland from the General Government. An independent spot
check against Stanford's April 1940 research map gave Germany for Vienna, Danzig,
Klaipėda, and Poznań, General Government for Warsaw, and Protectorate for Prague.

Rebuild with `npm run data:ww2` followed by `npm run data:history`. The verifier checks
the resulting topology with point-in-polygon tests for all six locations, including
the 1939/1940 Danzig transition. The manifest stores both source licenses and hashes.

Modern 1:10m close-zoom borders, administrative lines, physical details and place labels are disabled
for historical years. They cannot be safely projected onto dated CShapes states. The satellite
texture is January 2004 imagery used as a visual background, not a dated land-cover layer.

Selecting a historical country shows its boundary and flag alongside **exact-year** population
from the [World Bank](https://data.worldbank.org/indicator/SP.POP.TOTL) and refugee stock by
country of origin from [UNHCR Refugee Statistics](https://www.unhcr.org/refugee-statistics/).
The two statistics are fetched only for the selected country, after a short delay while scrubbing,
and cached in the browser. Missing observations remain empty; values from neighboring years are
never substituted. The UNHCR number is a stock, **not** the number of people displaced during
that year. The statistical country and the CShapes footprint may differ. To avoid misleading
matches, the viewer withholds statistics before 1992 and for known state successions until a
comparable modern state exists. These limits also apply on the static GitHub Pages demo.

### Historical Country Explorer

Selecting a state in Changing borders adds a **Development in the dataset** section to its panel.
It is derived in the browser from the period properties of `historical-topology.json`
(`code`, `period`, inclusive `start`/`end`, `name`, `capital`) plus `historical-flags.json`, once per
load and without decoding geometry or building snapshots (`src/lib/historyEntity.ts`). Each period
gets a hash of its topology arcs, so the panel can say whether the **dataset geometry** of two
periods is identical; it does not measure or classify the difference.

- **Map date**: the shown 1 January snapshot; the current dataset period with its exact dates.
- **Periods**: every record for the identifier, with the 1 January maps it covers (some short
  periods contain no 1 January and never appear on the map), capital, changed geometry or capital,
  and gaps in the dataset (for example H365 has no record from 2–3 June 1940 and from 28 June to
  31 December 1940). A new period is a new source record or a processing split; it is **not** by
  itself a regime change or a border shift. Periods starting 1939–1945 are marked as possibly split
  by the WWII annexation correction; Germany 1939–1945 and Danzig are marked as OHM geometry.
- **Labels**: the atlas labels per snapshot year (`historicalName`, which clarifies the single
  CShapes label for Germany, East/West Germany and Russia/the Soviet Union) next to the CShapes label.
  Known limitation, unchanged pending review: these labels switch on the year, not the date, so
  `H260` is labelled “West Germany” on 1 January 1949 although the Federal Republic was founded on
  23 May 1949, and `H365` is labelled “Soviet Union” on 1 January 1922 although the Union treaty dates
  from 30 December 1922. Correcting them is a classification change that needs separate approval.
- **Flags**: the dated FlagsData records of the identifier; the one valid on the map date is marked.
- **Documented events**: the four curated `HISTORY_EVENTS`, linked to the identifiers their own
  description names (`EVENT_ENTITIES`), with event date and primary source shown apart from the
  1 January snapshots used to compare them.
- **Absent identifier**: when the shown year has no record, the selection stays open and says
  “not in this snapshot”; the dataset’s silence is not presented as evidence that the state did not
  exist. Buttons lead to the nearest earlier and later snapshots that contain it.
- **Comparison**: from the panel, a period or event sets the existing `compareYear` (two globes,
  shared camera, border and area difference). The panel compares the identifier on both map dates:
  presence, label, period, capital and whether the dataset geometry is identical. When both
  snapshots contain the same identifier it states that CShapes can keep one identifier across
  successive regimes, so this is no evidence of state continuity. It never reports gains, losses or
  ownership for the identifier; a missing side makes the geometry “not comparable”.

Year changes use the Time Machine’s year (there is no second year state). The selection is shared
as `entity=<identifier>` together with `year` and `compare` (Changing borders only; see
[SCENARIOS.md](SCENARIOS.md)).

### Historical events explorer and regional time travel

The **Events** control in Changing borders opens a catalog of dated events
(`src/lib/historicalEvents.ts`). It adapts the existing catalogs without changing them:
the four Changing-borders lessons (`HISTORY_EVENTS`), the WWI events (`WW1_MOMENTS`) and the WWII
events (`WW2_MOMENTS`), plus three events added with a checked source. Merging keeps one entry per id
and per (date, English title). Region (Europe, Africa, Middle East, Asia & Pacific, Americas) and
theme (war, statehood, diplomacy, politics) are filter groupings, not historical classifications.

| Added event | Date | Source checked for the date |
| --- | --- | --- |
| India and Pakistan become independent dominions | 15 August 1947 | [Indian Independence Act 1947, s. 1](https://www.legislation.gov.uk/ukpga/Geo6/10-11/30/enacted) |
| Peace treaty with Japan signed | 8 September 1951 | [U.S. Office of the Historian](https://history.state.gov/milestones/1945-1952/korean-war) |
| Ghana proclaimed independent | 6 March 1957 | [U.S. Office of the Historian](https://history.state.gov/countries/ghana) |

None of these pages names a place, so these events are listed without a globe marker. Candidate
events whose source could not be fetched, or whose source gave a different date (Eritrea), were
not added.

#### Global expansion (37 events, `src/lib/historicalEventsCatalog.ts`)

Each date below was read on the cited U.S. Office of the Historian page
(`https://history.state.gov/countries/<slug>` or `.../milestones/<period>/<essay>`); the unit test
`historicalEvents.test.ts` pins every date and URL. Where a country page dates only the United
States' **recognition** of a state, the event is titled and described as that recognition
("United States recognizes …") and says that independence and recognition can fall on different
days; such a date is never presented as an independence day. No source names a place precise enough
for coordinates, so these events have no marker. A new region **Middle East** and a theme
**politics** (revolutions, coups, constitutional change) were added for filtering.

| Region | Dated by the event itself | Dated by U.S. recognition |
| --- | --- | --- |
| Africa | Libya declares independence (24 Dec 1951), France recognizes Moroccan independence (2 Mar 1956; U.S. on 7 Mar), South Africa declared a republic (31 May 1961), Kenya independent (12 Dec 1963), Portugal grants Angola independence (11 Nov 1975) | Sudan (1 Jan 1956), Tunisia (22 Mar 1956), Guinea (1 Nov 1958), Congo (30 Jun 1960), Nigeria (1 Oct 1960), Tanganyika (9 Dec 1961), Algeria (3 Jul 1962), Mozambique (25 Jun 1975), Zimbabwe (18 Apr 1980), Namibia (21 Mar 1990) |
| Asia | People's Republic of China proclaimed (1 Oct 1949) | Philippines (4 Jul 1946), Burma (4 Jan 1948), Ceylon (4 Feb 1948), Indonesia (28 Dec 1949), Singapore (11 Aug 1965) |
| Middle East | Kingdom of Saudi Arabia named by decree (18 Sep 1932), Transjordan declares independence (25 May 1946), State of Israel proclaimed (14 May 1948), Israeli attack across Sinai in the Suez Crisis (29 Oct 1956), Six-Day War begins (5 Jun 1967), Camp David Summit begins (5 Sep 1978), Iraq invades Kuwait (2 Aug 1990), Oslo Declaration of Principles signed (13 Sep 1993) | — |
| Americas | U.S. Congress votes for war with Spain (25 Apr 1898), Panama declares independence (3 Nov 1903), Jamaica (6 Aug 1962) and Trinidad and Tobago (31 Aug 1962) independent, Khrushchev announces dismantling of missiles in Cuba (28 Oct 1962), military coup in Chile (11 Sep 1973), Panama Canal Treaties signed (7 Sep 1977), Belize independent (21 Sep 1981) | — |

Checked but **not added**:
- The page gave only a month or a year: Korean War (June 1950), Malaysia (1963), Treaty of
  Portsmouth (September 1905), Panama Canal opening (1914), Cuban Revolution (1959).
- The page gave a different event or date than the candidate: South Korea (U.S. recognition
  1 Jan 1949), Lebanon (recognition 8 Sep 1944), Bangladesh (recognition 4 Apr 1972).
- The page has no date for the event: Mexican Revolution (1910), South Africa 1994, Latin American
  returns to democracy.
- The CIA World Factbook, tried as a second source for independence dates, now serves only a
  retirement notice. Its pages could not be used.

The Milestones essays are marked as retired by the Office of the Historian but are still served;
their source labels name the Milestones period, not the essay title.

#### Regional history packs

Four curated packs are guided tours with an introduction, listed as cards with period and step
count: **Africa Through Independence** (17 steps, 1951–2011), **Asia in Transformation** (8,
1946–1965), **Middle East: A Changing Region** (8, 1932–1993) and **Americas: Political Turning
Points** (8, 1898–1981). Their event lists are explicit, chronological and drawn only from the
catalog; the thematic "States dissolve and emerge" tour keeps its original six events. Packs share
as `tour=<id>&event=<id>` and show the introduction and a copy-link control while running. Their
introductions repeat that war, occupation and military control are events, not changes of state
borders, and that the maps show 1 January borders.

- **Markers**: only events whose source catalog gives a place anchor (the WWI and WWII events) get
  a marker, and only while the explorer is open; the four lessons carry a camera focus, not a place.
  Markers are the filtered results, or the tour's events during a tour.
- **Event date vs. map date**: the detail shows the exact event day and the shown 1 January map,
  with the distance in days and whether the map is before, on or after the event. A map before the
  event never shows its outcome; a later map is not evidence that the event caused what it shows.
  “Show map of …” opens the first 1 January after the event (the same day for an event on
  1 January); for events after 1 January 2019 the nearest allowed map is shown and labelled as
  before the event. WWI events state that the WWI view uses 1 January maps of their year; WWII
  events name their WWII moment, whose maps use that moment's exact date.
- **Comparison and lessons**: only the curated lessons offer a before/after comparison, a guided
  lesson and Country Explorer links (`EVENT_ENTITIES`). No event triggers a claim of a border change,
  annexation, occupation or succession.
- **Time travel**: curated tours (Europe in WWI, Europe in WWII, Asia and the Pacific 1941–1951,
  states dissolving and emerging) are built only from catalog events; a tour can also run through
  the current filter results. Each step sets the Time Machine year to the event's first later map
  and focuses the camera. Playback waits seven seconds per step and schedules the next step only
  when the map and any comparison are ready; any other year change pauses the tour.

The comparison control shows two selected snapshots side by side. Rose lines show removed boundary
segments; teal lines show added segments. Translucent areas show geometric losses and gains for
states present in both snapshots. A Web Worker computes the polygon difference, debounced while
scrubbing and cached for recent year pairs. New or dissolved states are listed as entity changes
rather than coloring their entire footprint as a territorial gain or loss. The right globe follows
the left camera. Four guided lessons explain selected transitions, focus the map and ask a question;
each links to a primary source. A copied URL includes `year` and `compare`
parameters, so the same view opens on the GitHub Pages demo without an account.

The **Conflicts** control is available only in Today and opens five source-dated regional learning points.
Selecting a point in the list or on the globe shows context, a question and the underlying UN
report. This is an editorial selection, not a complete conflict registry. Markers are approximate
regional anchors, not battle sites or safety advice. Ukraine also has a dated pink line derived
from VIINA settlement-control categories. It is an **estimated category boundary**, not a surveyed,
verified or live tactical frontline. Its date and license are shown in the panel; data older than
14 days are flagged. No line is drawn for the other conflicts without a reliable reusable geometry.
Each card shows its source date and flags a report older than 60 days for review. Gaza is
classified as a fragile ceasefire, following the cited OCHA report.

There is no historical boundary source in this project for 2020–2025. The slider therefore ends
at 2019. The scenario menu opens Today explicitly; it does not silently reuse today's borders for those
years. CShapes is a scholarly reconstruction. Territorial changes below the source's threshold,
wartime changes, dependent territories and disputed boundaries reflect its coding choices.

The independent occupation/control layer adds exact-year, actor-attributed snapshots where data
exists. Historical areas are schematic regional reconstructions; missing years remain unshaded.
See [scenario boundaries and territorial control](SCENARIOS.md) for sources and coverage limits.

## Data pipeline

`npm run data:history` downloads the pinned CShapes GeoJSON from ETH Zurich if absent, checks its
SHA-256, and builds `public/data/historical-topology.json` plus a binary cache of pre-triangulated
country-period caps. The 26 MB upstream file is ignored by Git. A single 710-period TopoJSON stores
shared boundaries; the browser selects valid periods and copies their precomputed geometry when a
year changes. It keeps the WebGL renderer, textures and camera alive. The geometry stores
per-period indices as unsigned 16-bit values (or 32-bit if a rebuilt period requires them) and
expands them on load. Less aggressive topology simplification and denser pre-triangulation preserve
more of the source's shape at close zoom, but cannot add detail absent from CShapes. `historical-manifest.json` records source provenance,
license, schema and SHA-256 checksums. `npm run data:history:verify` checks annual coverage, dates,
geometry and generated files and runs in CI.

`npm run data:conflicts -- --refresh` downloads the current annual VIINA control archive and
GeoNames settlement tessellation, uses **only `status_boost`** (VIINA reports and crowdsourced
Wikipedia status), and writes `public/data/conflict-lines.json`. It does not use the dataset's
ISW-based `status` column. The result carries observation date, source hashes and ODbL metadata.
GitHub Pages attempts a refresh every Monday (`npm run data:conflicts:refresh`). The refreshed pair
is published only if it passes `npm run data:conflicts:verify`; a failed download or an invalid
result restores the verified checked-in snapshot, visibly dated and flagged when old, and the
deployment stops if no verified snapshot exists (policy in [DEPLOY.md](DEPLOY.md)). The derived data is available at
`/data/conflict-lines.json` (or `/World-Atlas/data/conflict-lines.json` on GitHub Pages).
Source: [VIINA 2.0](https://github.com/zhukovyuri/VIINA), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

From `frontend/`, after `npm run build`, run `npm run preview -- --port 4173` and `npm run smoke:history` in separate
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
