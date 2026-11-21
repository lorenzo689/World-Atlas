# World War II learning atlas

The World War II scenario (`/explore?scenario=ww2&year=1944`) shows seven dated moments from 1939
to 1945. Each moment has **one date**, and all three map layers show that day:

1. **State borders**: CShapes 2.0 on the moment's date, with the German Reich replaced by the dated
   OpenHistoricalMap (OHM, CC0) relation valid on that day. Annexations appear only from their
   date. The General Government and the Protectorate of Bohemia and Moravia are occupation, not
   Reich territory, and are subtracted (the GG also after it ended on 19 January 1945, because the
   Reich relation still contains its area). The "Changing borders" timeline keeps 1 January.
2. **Occupation, annexation and client states**: areas with an actor, a kind (occupation,
   annexation by another state, client state, Allied control, contested) and a precision.
3. **Fronts**: lines with a source and a precision.

Occupation is never sovereignty, and the colours show **sides**, not individual powers:

| Colour | Meaning |
| --- | --- |
| dark red `#b91c1c` | Axis powers: state territory, annexations, client states (incl. Manchukuo) |
| red `#f87171` | Axis powers: occupation and military presence |
| dark blue `#1d4ed8` | Allies: state territory |
| blue `#60a5fa` | Allies: occupation, military control and presence |
| grey `#a1a1aa` | Soviet Union before 22 June 1941 (eastern Poland 1940), not Allied |
| amber `#f59e0b` | Contested (northern Norway 1940, Tunisia 1942, the Philippines and Burma 1944–45) |

Unshaded means neutral or *no claim* (Spain, Sweden, Switzerland, Vichy France 1940–42, Finland
after its armistice). Which side every state and colony was on, and from when, is a dated table
in `scripts/lib/ww2-sides.mjs` (entry into the war, change of sides, conquest); each area shows the
reason in the app. On atlas dates every state is additionally split by the atlas: e.g. Hungary on
15 April 1945 is Soviet-held (blue), not Axis state territory. The individual power (e.g. Fascist
Italy) is kept as `power`. Japanese-occupied China (light red) comes from the Asia/Pacific atlas
sheets: on 1943–1945 dates from the sheet of that day; for 1941 and 1942 from the earliest sheet
(1 July 1943), marked `schematic`, because the China front changed comparatively little between
1939 and the Ichi-Go offensive of 1944. Manchukuo is a separate client state (dark red).

## Sources and precision

| Precision | Meaning | Used for |
| --- | --- | --- |
| `administrative` | Dated OHM boundary of an occupation regime, clipped to land | General Government, Protectorate, Military Administration in Belgium and Northern France, Reichskommissariate, Croatia, Slovakia, Serbia, Montenegro, Albania, Greece, Dodecanese, Hungarian/Bulgarian/Italian annexations |
| `digitized` | Clipped to the Axis-held area of a georeferenced U.S. Army atlas sheet | 1943-12-15, 1944-12-15 and 1945-04-15: fronts and the extent of every regime |
| `schematic` | Original generalisation through places with a documented status | Fronts 1939–1942, France's demarcation line 1941, Norway 1940/1944/1945, western Poland 1939 |

OHM line work is itself marked approximate. Some OHM relations mean something other than their
name: "French State" covers all of metropolitan France *and Algeria* (so it is not used as a zone),
"German occupation of Italy" covers only the two operational zones in the north-east (so occupied
Italy comes from the atlas). `scripts/build-ww2-occupation.mjs` documents each such decision.

### The georeferenced atlas (1943–1945)

The U.S. Army *Atlas of the World Battle Fronts in Semimonthly Phases* is a public-domain U.S.
government work; its European sheets for the three dates are on Wikimedia Commons and pinned by
SHA-256 in `scripts/build-ww2-atlas.mjs`. The pipeline (`npm run data:ww2:atlas`):

1. **Georeference**: city markers are found by a ring detector and assigned to cities with known
   coordinates (`scripts/source/ww2-atlas-gcps.json`; seven markers on coloured areas of the 1943
   sheet were read off 3× enlargements). A conic equal-area projection plus an affine transform
   maps pixels to longitude/latitude. Outliers (> 15 km and 3× the median) are dropped.
2. **Classify** each pixel by the atlas colour key: white = Axis-held, pink and dark red = Allied
   (dark red = gained in the last half month), grey = neutral, blue-green = sea. Text, rivers and
   borders take the class of the nearest land pixel.
3. **Clean up**: white arrows, city markers and labels inside Allied areas (≤ 450 px) are removed;
   encircled pockets such as the Ruhr and the Harz on 15 April 1945 are larger and kept. Colour
   fringes of black lines (≤ 400 px) are removed. Lakes do not count as open sea.
4. **Fronts** are the parts of the Axis-held outline that run over land, face a substantial Allied
   area and no neutral country. A short, reviewed list excludes places without any land front on
   these dates (British Isles, North Africa after May 1943, Lake Geneva, the French Mediterranean
   coast after August 1944); every entry states its historical reason.

| Sheet | Control points | Leave-one-out error |
| --- | --- | --- |
| 1943-12-15 | 30 | 7.9 km |
| 1944-12-15 | 82 | 9.6 km |
| 1945-04-15 | 38 | 7.7 km |
| Asia/Pacific 1943-07-01 | 18 | 34 km |
| Asia/Pacific 1943-12-15 | 23 | 28.5 km |
| Asia/Pacific 1944-12-15 | 23 | 33.1 km |
| Asia/Pacific 1945-04-15 | 21 | 33.7 km |

The Asia/Pacific sheets use a Mercator projection (smallest leave-one-out error among the tested
projections) and a coarser scale (~7 km per pixel). Their inset maps (New Georgia, Leyte, Okinawa)
show other places at other scales and are masked; pixels east of 180° are masked too. The border
of the Mongolian People's Republic, not at war with Japan until 9 August 1945, is excluded from
the fronts. Fronts shorter than twice a sheet's error are dropped as indistinguishable from noise.

The leave-one-out error (each control point predicted by a fit without it) is the positional
uncertainty shown in the app. It includes the drawing accuracy of the 1940s printed map. The sheets
end around 43°N (1944/45): all of Italy south of the sheet is Allied-held and treated as such.

## Coverage ledger

| Date | Fronts | Areas |
| --- | --- | --- |
| 1939-09-16 | Warsaw area (schematic) | Western Poland (schematic), Protectorate, Slovakia, Albania |
| 1940-06-04 | Somme–Aisne (schematic) | General Government, Soviet-annexed eastern Poland, Denmark, Low Countries, Norway (south occupied, north contested), northern France |
| 1941-11-12 | Eastern Front from Lake Ladoga to Taganrog (schematic) | Western Europe incl. France's occupied zone to the demarcation line, Balkans by occupier, Hungarian occupation of Bačka, occupied Soviet territory west of the front |
| 1942-11-18 | Eastern Front from Lake Ladoga to the Caucasus (schematic) | Fully occupied France, Balkans, occupied Soviet territory incl. the Caucasus |
| 1943-12-15 | Eastern, Finnish and Italian fronts (digitised) | All regimes clipped to the atlas; Allied-controlled southern Italy |
| 1944-12-15 | Western, Alpine, Italian, Eastern and Balkan fronts (digitised) | Remaining occupation, Courland, Reich territory taken by the Western Allies and the Red Army |
| 1945-04-15 | All European fronts incl. the Ruhr and Harz pockets (digitised) | Remaining occupation, Allied-held Reich territory split at 13.5°E |

Known gaps: Romanian-administered Transnistria before 1943 (inside the eastern area from 1943),
North Africa before 1943 (Tunisia in 1942 is amber; the Libyan and Egyptian fronts are not drawn),
partisan zones other than the two named below, the Solomon and Gilbert Islands, Wake and the
Aleutians, and the exact Japanese perimeter in China in 1941–1942 (schematic, see above). Southeast Asian colonies are
coloured as whole units by the dated side table, not split by the atlas. The schematic 1939–1942 fronts are generalised through towns; they
are not traced from a map.

## Audit of 15 April 1945 (November 2026)

Every finding was checked against a source before the data changed; each is now a control point
in `ww2-history.test.ts`.

| Finding | Correct state on 15 April 1945 | Source |
| --- | --- | --- |
| Atlantic pockets shown as liberated France | German-held: Dunkirk (until 9 May), Lorient (10 May), Saint-Nazaire (11 May), La Rochelle (7/8 May), Royan and Pointe de Grave (17/20 April), Île d'Oléron (30 April) | [Atlantic pockets](https://en.wikipedia.org/wiki/Atlantic_pockets) |
| Channel Islands unshaded 1941–1945 | German-occupied from 30 June/1 July 1940 to 9 May 1945 | [Atlantic pockets](https://en.wikipedia.org/wiki/Atlantic_pockets) |
| All of Crete shown as liberated Greece | The German garrison held the Chania area until 10 May 1945; Rethymno and Heraklion were liberated in October 1944 | [Fortress Crete](https://en.wikipedia.org/wiki/Fortress_Crete) |
| Breslau, the Vistula delta/Hel and Samland shown as Soviet-held | German pockets: Breslau until 6 May, the Vistula delta and Hel until May, Pillau until 25 April | [Siege of Breslau](https://en.wikipedia.org/wiki/Siege_of_Breslau), [East Pomeranian offensive](https://en.wikipedia.org/wiki/East_Pomeranian_offensive), [Samland offensive](https://en.wikipedia.org/wiki/Samland_offensive) |
| Liberated Alsace-Lorraine, Luxembourg, Eupen-Malmedy shown as "Reich territory taken by the Allies" | Back to France, Luxembourg, Belgium; on atlas dates an annexation counts only while the Axis still held it | — |
| Hollandia (Allied since April 1944), Leyte, Manila (liberated 3 March 1945), Mandalay (20 March) inside whole-unit Japanese or contested areas | Indonesia, the Philippines and Burma are now split by the Asia/Pacific sheets | Atlas sheets |
| Okinawa shown Allied in December 1944 (below the Asia sheet's resolution) | Japanese until the landing of 1 April 1945; contested on 15 April (Naha fell 24–27 May) | [Battle of Okinawa](https://en.wikipedia.org/wiki/Battle_of_Okinawa) |
| Finland unshaded after its armistice | At war with Germany (Lapland War); its declaration of 3 March 1945 states a war since 15 September 1944; the north-western tip of Lapland was German-held until 27 April 1945 | [Lapland War](https://en.wikipedia.org/wiki/Lapland_War) |
| Side dates | Chile entered on 11 April 1945 (not 12 February), Uruguay on 15 February, Lebanon on 27 February 1945 | [Declarations of war during WWII](https://en.wikipedia.org/wiki/Declarations_of_war_during_World_War_II) |
| Manila shown Allied on 15 December 1944 (coastline offset of the Asia sheet at Manila Bay) | All of Luzon Japanese-occupied until the Lingayen landing of 9 January 1945; on 15 April 1945 the Cordillera with Baguio (until 27 April) still Japanese-held | [Battle of Luzon](https://en.wikipedia.org/wiki/Battle_of_Luzon) |
| Rangoon and the Irrawaddy delta shown Allied on 15 April 1945 (the sheet prints a hatched air-operations zone over the delta) | Japanese-held until Rangoon was entered on 3 May 1945 | [Operation Dracula](https://en.wikipedia.org/wiki/Operation_Dracula) |
| Missing event on the map date | Liberation of Bergen-Belsen, 15 April 1945 (~55,000 prisoners) | [USHMM](https://encyclopedia.ushmm.org/content/en/article/bergen-belsen) |

Decisions (not facts): Albania is coloured Allied from 29 November 1944 (liberated by its partisan
movement, which fought the Axis). Japanese client regimes in China (Wang Jingwei, Mengjiang) are
shown as Japanese-occupied China, not as separate client states; Manchukuo is a client state.
The strongholds are schematic circles around the fortress towns (boxes for Crete, Luzon, Lower Burma and Okinawa): the sources give towns and dates,
not boundaries.

Remaining limits: positions carry the atlas error (Europe ±8–10 km, Asia/Pacific ±28–34 km);
some Pacific atolls and garrisons (Wake, the Gilbert and Solomon Islands, Rota, the bypassed
Marshall atolls) are not drawn; partisan zones other than Užice and Bihać (Italy, China, the
Yugoslav interior in 1943–44) are not drawn; the base map keeps the Reich's
dated annexation borders as lines.

## Second review (November 2026)

The control points of the first audit were chosen while the data was built, so they share its blind
spots. A second batch was written afterwards from the capture and liberation dates in the Wikipedia
articles of the places, in regions the first batch hardly touched: Ukraine, the Caucasus, the
Adriatic side of Italy, the Netherlands, central Germany, the south-west Pacific, Burma and the
Philippines. It is a second pass by the same author, **not an independent audit**: a truly
independent review needs another person or another dataset.

Of 132 new points 28 disagreed with the map. About half were badly placed test points (a coast, a river
line or a tiny island closer than the sources' error); the others were data errors:

| Finding | Correct state | Source |
| --- | --- | --- |
| Finnish-held Karelia missing in 1941–1943 (Vyborg, Sortavala, Petrozavodsk showed as Soviet). The atlas colours Finland only partly (Helsinki and Joensuu are not marked as Axis) | The territory ceded in 1940 (Finland's 1939 border within the Soviet Union's 1941 border) plus East Karelia, from the Axis-held part of the December 1943 sheet because the front hardly moved between December 1941 and June 1944 | [Continuation War](https://en.wikipedia.org/wiki/Continuation_War) |
| Deepest German advance in the north missing | Tikhvin German-held from 8 November to 9 December 1941 | [Tikhvin offensive](https://en.wikipedia.org/wiki/Tikhvin_offensive) |
| Rabaul, New Ireland, Bougainville, Wewak, Lae/Salamaua, Madang and Buna–Gona shown as Allied. The atlas digitisation removes islands below 450 px as specks | Japanese-held with their dates; Rabaul and Kavieng bypassed; Bougainville amber from the Australian offensive of November 1944 | [Rabaul](https://en.wikipedia.org/wiki/Rabaul), [Bougainville campaign](https://en.wikipedia.org/wiki/Bougainville_campaign), [Wewak](https://en.wikipedia.org/wiki/Wewak) |
| Japan's Pacific mandate not drawn (Marshalls, Carolines with Truk, Palau, Marianas, Guam) | Japanese from 7 December 1941; Marshalls, Saipan/Tinian and Guam U.S.-controlled after their conquest in 1944; Truk and Babeldaob bypassed | [Truk Lagoon](https://en.wikipedia.org/wiki/Truk_Lagoon), [Mariana and Palau campaign](https://en.wikipedia.org/wiki/Mariana_and_Palau_Islands_campaign) |
| Resistance-held territory missing | Republic of Užice (24 September–1 December 1941), Bihać Republic (4 November 1942–29 January 1943) | [Užice](https://en.wikipedia.org/wiki/Republic_of_U%C5%BEice), [Bihać](https://en.wikipedia.org/wiki/Biha%C4%87_Republic) |

Dates checked against the Wikipedia articles during the follow-up (November 2026): Kavieng fell on 24 January
1942, Bougainville was invaded from 9 March to 5 April 1942, Buna–Gona 21 July 1942 to 22 January 1943,
Majuro/Kwajalein/Eniwetok 31 January/7 February/23 February 1944, Saipan 9 July, Tinian 1 August and Guam
10 August 1944, Peleliu from 15 September 1944 (Koror bypassed until August 1945). For Wewak and Madang the
sources disagree and mention mid-December 1942, so they are drawn only from 15 December 1942 and the
map of 18 November 1942 makes no claim about them. Statements I could not confirm in a source were
removed (Rota and a list of four bypassed Marshall atolls; Mili is documented).

Decisions, not facts: Tunisia on 18 November 1942 stays amber (Axis forces landed on 9 November, French
forces still held parts); Cebu and Zamboanga on 15 April 1945 stay amber because the Japanese held
the interior for months after the landings; Ethiopia is not coloured (its status in 1941 was a
British-protected restoration). Points moved inland or dropped: Ortona, Madang (coast), Guam,
Tacloban, Liepāja, Iloilo, Palawan, Tarakan, Faenza (taken one day after the map date), Magdeburg,
Groningen, Frankfurt (Oder) and Stettin (all within the atlas error of a river or front).

**Known deviation, not fixed:** in the Senio sector (Imola, 15 December 1944) the digitised sheet
puts the Allied area about 20 km too far north-west. The test `known deviation` keeps it visible: it
passes while the data is wrong and fails as soon as the data is fixed.

The 1:50 m land model has no polygon for some atolls (Kwajalein) and drops others (Wake), so the
Pacific areas are clipped to the islands it does contain.

## Reproducible, incremental build

`npm run data:ww2:occupation` computes each map date separately and keeps the result in
`scripts/data/occupation-cache/` (ignored by Git). A date is rebuilt only when its inputs change:
its entries, atlas sheets, Reich footprint, strongholds, the side table for that date, CShapes, or
`CACHE_VERSION` in the script. Without any change the whole build takes about one minute instead
of twelve. `--fresh` ignores the cache; `--adopt=<dates>` re-keys dates that a change provably
does not affect. Bump `CACHE_VERSION` when the clipping logic itself changes for every date.

## Verification

From `frontend/`:

```sh
npm run data:ww2 && npm run data:history     # dated Reich borders and base map
npm run data:ww2:atlas -- --debug              # fronts; review overlays in perf-results/
npm run data:ww2:occupation && npm run data:territories
npm test -- src/lib/__tests__/ww2-history.test.ts
npm run smoke:ww2 && npm run smoke:scenarios   # against a running app (SMOKE_URL)
```

`ww2-history.test.ts` and `ww2-second-review.test.ts` check **391 historical control points**
(239 and 152): places with a documented status on each date (e.g. Kalinin German since 14 October 1941, Bremen still German on 15 April 1945,
Naples Allied since 1 October 1943). The data before the first rebuild failed 76 of the first batch,
and the audited data 28 of the second. Coastal
cities are replaced by inland places, because generalised coastlines run a few kilometres past
them. When a check fails, verify the historical date before changing either the data or the test.

Moving a front from `schematic` to `digitized` needs a georeferenced source sheet, its control
points and leave-one-out error, a public-domain or permission rationale, and passing control
points. Do not interpolate between dates.
