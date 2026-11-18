# Performance

How to measure, what the budgets are, what was changed and where we stand.

## 1. Measure

### Live overlay

Open any page with `?debug=1` (e.g. `http://localhost:5173/?debug=1`). A small overlay (bottom left) shows a rolling
window: render rate, frame p50/p95, **draw calls**, triangles, geometries, textures, shader programs, long tasks and JS
heap. Use it on real devices (phone via remote debugging, laptop with integrated GPU) while rotating the globe.

With `?debug=1` the adaptive quality governor is off, so numbers are reproducible. Add `&adaptive=1` to turn it back on.
`window.__perf.snapshot()` / `.reset()` and `window.__globePose()` expose the numbers to scripts.

> The globe renders **on demand**: while nothing moves, no frames are produced, so "renders/s" is the render rate,
> not the display refresh rate. **Frame p50/p95/max** only count *chained* frames (the loop was already running, e.g.
> drag, damping, auto-rotate, fly-to), so idle gaps do not look like slow frames. **Tick** is the CPU time of one render
> tick (controls + render submit), measured for every render including hover-triggered ones.

### Scripted run

```bash
cd frontend
npm run build
npm run perf                                  # software GL: draw calls, transfer size
npm run perf -- --gpu                         # real GPU: also frame-time, ready time, long-task and heap budgets
npm run perf -- --label my-change             # result in perf-results/my-change.json
npm run perf -- --shots perf-results/shots    # also save screenshots (satellite, hover, selected, political, data)
npm run perf -- --width 390 --height 844 --dpr 3 --cpu 4   # phone-like
```

Scenario: load → settle 4 s → **idle** 3 s → **drag** (90 mouse moves) → **hover** sweep (120 moves) → **select**
(via the search box, 3.5 s). Each phase reports renders/s, frame p50/p95/max, tick p95/max, long tasks, draw calls,
triangles, geometries, textures, heap. The output also names the GL renderer so a software run cannot be mistaken
for a GPU run. Results are compared against `perf-budget.json`; the process exits non-zero on a miss.

> Software GL (SwiftShader, the default) is ~50× slower than a GPU and every software-rendered frame counts as a
> long task. Use it for **relative** comparisons and hardware-independent metrics (draw calls, bytes, geometry
> counts). Frame times, ready time and long tasks are only enforced with `--gpu` on real hardware.

### Interaction smoke test

```bash
npm run build
npm run smoke
```

Drives the production build in a real browser: drag rotate, wheel zoom, touch pinch, search-select, hover tooltip,
click-select, mode switching (checks that the globe repaints), leaving to a country page and returning (camera
restored), resize, and "no page errors". Exits non-zero on any failure.

## 2. Budgets (`perf-budget.json`)

| Metric | Limit | Enforced |
| --- | --- | --- |
| Draw calls, worst phase | 60 | always |
| Transfer size at load | 4.4 MB (re-baselined, see section 6) | always |
| Transfer size of the WWII view | 40 MB | always |
| Ready (globe interactive) | 3 s | `--gpu` |
| Long-task time per phase | 200 ms | `--gpu` |
| Frame p95 (chained frames) | 20 ms | `--gpu` |
| Frame max (chained frames) | 100 ms | `--gpu` |
| Tick CPU max | 50 ms | `--gpu` |
| JS heap | 250 MB | `--gpu` |

## 3. What changed

| Area | Change |
| --- | --- |
| Draw calls | All countries are one merged vertex-coloured cap mesh + one merged border line set; hover/selection are two highlight slots that reuse the cap buffers via draw ranges (≈4–6 calls total, was ≈4,800). |
| Render loop | On demand: frames only while something moves (drag, damping, auto-rotate, tween, hover change). Auto-rotate stops after 30 s of idle rotation. |
| Quality | Pixel ratio capped at 2 (1.5 on touch); MSAA only below 1.5× DPR; governor lowers DPR (down to 1.0) and finally drops bump/specular/atmosphere when frames exceed ~24 ms. 2k colour map on touch / ≤4 GB devices. |
| Picking | Sphere intersection + point-in-polygon (bbox prefilter, last-hit shortcut) instead of raycasting triangles. |
| React | Hover no longer re-renders anything: highlight, cursor and tooltip are updated imperatively. Pose updates are throttled to ~150 ms. |
| Globe scene | `react-globe.gl` / `three-globe` replaced by a small three.js scene (`src/lib/globeScene.ts`); atmosphere shader adapted from three-globe (MIT). |
| Startup | Boundaries + geometry are prefetched at module load; shader programs compile asynchronously behind the loading veil (sync error checks only in dev); globe chunk is requested immediately; sky + data preloaded in `index.html`. |
| Boundaries | TopoJSON topology (shared borders once), topology-aware simplification (80.6k → 64.1k points, short arcs/tiny islands protected), 0.01° precision. |
| Geometry | Country caps are triangulated at build time (`public/data/geometry.{bin,json}`): in-browser tessellation took ≈8 s of main-thread time. |
| Textures | WebP, resized: colour 4096 (604 KB) / 2048 (192 KB), bump 40 KB, specular 75 KB, sky 44 KB (was 3.2 MB in JPG/PNG). Textures are cached and disposed. |

## 4. Results

### Software GL (hardware-independent metrics)

| | Before | After merging the map (draw-call fix) | Now |
| --- | ---: | ---: | ---: |
| Draw calls, idle / drag | ≈4,800 | 4 / 7 | 4 / 4 |
| Draw calls, hover (multi-island country) | ≈4,800 | 385 | 4 |
| Geometries alive during hover | – | 258 | 17 |
| Transfer at load | ≈4.3 MB | 4.3 MB | 2.9 MB* |
| Globe JS chunk | 1,917 KB (535 KB gz) | 1,917 KB | 626 KB (161 KB gz) |

\* `geometry.bin` (1.45 MB raw, ≈670 KB gzipped) is reported uncompressed by `vite preview`; serve `.bin` with
compression in production. Textures + boundaries ≈1.0 MB, JS ≈0.3 MB.

### Real GPU (Intel UHD 620, integrated; Chrome headless, D3D11)

Desktop, 1280×800 @1x (`npm run perf -- --gpu`):

| Phase | renders/s | frame p50 / p95 / max (ms) | tick p95 / max (ms) | long tasks |
| --- | ---: | --- | --- | ---: |
| idle (auto-rotate) | 60 | 16.6 / 17.7 / 19 | 1.1 / 1 | 0 |
| drag | 60 | 16.7 / 18.0 / 24 | 1.0 / 2 | 0 |
| hover sweep | 23 | 16.7 / 25.9 / 102 | 1.2 / 17 | 0 |
| select + fly-to | 29 | 16.7 / 21.2 / 67 | 1.2 / 4 | 0 |

Ready (interactive): **2.3 s** (3.7 s before the start-up fixes below). Repeated hover sweeps give p95 ≈ 18–19 ms
with occasional single outliers (24–100 ms). Removing the tooltip blur or the tooltip itself made no measurable
difference, so the outliers look like system noise rather than one cause. Frame p95/max are borderline against the
20 / 100 ms budget on this GPU.

Phone-like (390×844 @3x, 4× CPU throttle, same GPU):

| Phase | renders/s | frame p50 / p95 / max (ms) | tick p95 / max (ms) | long tasks |
| --- | ---: | --- | --- | ---: |
| idle | 58 | 16.8 / 21.2 / 67 | 6.9 / 16 | 0 |
| drag | 58 | 16.8 / 21.2 / 83 | 2.8 / 6 | 1 (74 ms) |
| hover | 24 | 17.3 / 35.5 / 81 | 5.7 / 38 | 2 (159 ms) |
| select + fly-to | 16 | 16.9 / 76.9 / 200 | 4.9 / 25 | 4 (715 ms) |

Ready: 7.9 s. Rendering itself holds up under 4× throttle (tick p95 ≤ 7 ms). The misses are main-thread work around
selection (info panel mount, data-fetch state updates, layout/paint) and start-up JS / shader compilation. That is
outside the globe itself and is the target of the panel / country-page work.

### Where the start-up time went (desktop CPU profile)

| Item | Before | After |
| --- | ---: | ---: |
| Browser-side tessellation of 1,611 polygon pieces | ≈8 s (measured in node) | 0 (build time) |
| Boundaries + geometry fetch started at | ≈0.9 s (after the WebGL probe) | ≈0.05 s (module load) |
| Synchronous shader link checks (`getProgramInfoLog`) | ≈1.5 s | off in production, async compile |
| WebGL support probe (`hasWebGL`) | ≈0.5 s | unchanged (first GPU context creation) |

## 5. Not done / ideas

- **KTX2 / Basis textures**: needs `toktx`/`basisu`, not available here. WebP is the interim.
- **Packing bump + specular into one texture**: needs a custom shader; the two 8-bit WebP maps are small.
- **LOD (1:110m while zoomed out)**, **raster ID-buffer picking**: picking is already ≪1 ms, LOD not needed yet.
- **Highlight side walls** (the translucent wall under a raised country) were dropped; the raised cap + outline remain.
- **Fonts** (Inter + Instrument Serif subsets) and route-level bundle analysis for the country pages are untouched.
- `geometry.bin` could shrink (Uint16 indices per country, quantised lng/lat) if its size matters.
- Info-panel mount cost on selection (see phone profile above).

## 6. World War II view and the historical geometry (November 2026)

`npm run perf` also loads `/explore?scenario=ww2&year=1945` on a fresh page and reports the time
until the territory areas are on screen, the transfer size and its largest files. CI runs it
against the production build, so a regression like the one below fails the build.

**Regression found and fixed.** `historical-geometry.bin` (pre-triangulated base borders) was 12.4 MB
before the WWII work and grew to 54 MB (commits `08e1440`, `9dddd9b`); the WWII view downloaded
71 MB in total. Two causes, both in `scripts/build-history.mjs`:

1. Every state whose outline touches the Reich footprint is clipped once per sample day (every
   1 January from 1939 to 1945 plus each moment date) and was stored once per day even when the clipped
   shape did not change (the Soviet Union had eight identical periods from 1941 to 1945). Identical
   consecutive samples are now one period: 890 periods became 757.
2. Broad earcut triangles were split below 2.5°, which turned 1.4 million outline points into 3.2
   million vertices and 4.8 million triangles. The caps sit 0.3 above the sphere (`CAP_RADIUS`), so a 6°
   edge (sag about 0.14) is safe, and 6° is what the live tessellator already uses for the current
   map (`CURVATURE_RESOLUTION`).

| Measured (vite preview, uncompressed) | Before | After |
| --- | --- | --- |
| `historical-geometry.bin` | 53,137 KB | 18,805 KB |
| `historical-topology.json` | 7,240 KB | 6,931 KB |
| WWII view, transfer in total | 70,760 KB | 36,113 KB |
| WWII view, area triangles | 490k | 304k |
| Home page, transfer in total | 4,017 KB | 4,014 KB |

The remaining 18.8 MB is still 6 MB above the pre-WWII file; the wartime copies of states that the
Reich footprint really changes (Germany, Poland, Czechoslovakia, the Baltic states) are genuinely
different shapes. GitHub Pages probably does not compress `.bin` files, so the wire size there is the
raw size.

Time until the areas are on screen: about 38 s in this software-GL run on a machine under memory
pressure, but only about 3.5 s of that is tessellation (measured in Node without rendering; the
Soviet Union takes 1.1 s, Canada 0.8 s). The rest is SwiftShader rendering competing for the CPU.

**Home page budget re-baselined to 4.4 MB.** The 3 MB limit had been exceeded by 1 MB without notice
because `npm run perf` was not in CI. Today's 4.0 MB: data 2.1 MB (`geometry.bin` 1.5 MB raw, 0.67 MB
gzip), textures 0.9 MB, JS and CSS 1.0 MB raw. Added since the 2.9 MB measurement: the star catalogue
(142 KB), `territories-today.json` (140 KB) and a duplicated `night-sky.webp` (44 KB, the preload lacked
`crossorigin` and did not match the texture request; fixed).

**Bug found while measuring:** the service worker gave the 5.6 MB `territories-history.json` an overall
time limit of 5 s. On a slow connection the download was cut off and the panel showed "Gebietsflächen
nicht verfügbar". The limit now ends when the response headers arrive; two tests cover a slow
download and a server that does not answer.

## 7. Real-GPU measurement and the satellite-tile upload (November 2026)

Intel UHD 620, Chrome headless with D3D11, 1280×800 @1x, `npm run perf -- --gpu`. The machine had under 1 GB of free
memory, so single runs vary by tens of milliseconds; the table gives one run before and one after the fix.

**WWII view** (fresh page, 1945): territory areas on screen after 6–16 s (38 s with software GL), 17 draw calls,
304k triangles, drag at 58–59 renders/s with frame p95 18.7 ms and max 21–22 ms. This view meets the frame
budgets on this GPU.

**Country selection with satellite imagery** was the one regression. The profile of the select phase showed
910 ms of main-thread time in `texSubImage2D`: the 12 satellite tiles (1350 px, 7 MB each as pixels) arrived
within a second, and a plain image element is decoded lazily inside the upload. `ImageDetail` now decodes with
`ImageBitmapLoader` (off the main thread), closes the bitmap when a tile is evicted and lets one tile join the
scene per frame.

| Select phase | Before | After |
| --- | ---: | ---: |
| `texSubImage2D` main-thread time | 910 ms | 146 ms |
| Long tasks | 10 (902 ms) | 3 (181 ms), 1 (64–74 ms) in two other runs |
| Tick p95 | 101.7 ms | 13.0 ms |
| Frame p95 / max | 78 / 192 ms | 57 / 126 ms (36 / 53 ms in a second run) |

The visual result was checked (Italy with its tiles in the right orientation) and `smoke:detail` still reports
12 image tiles. **Still open:** frame p95 in the select and hover phases misses the 20 ms budget on this GPU
(it was 21 ms and borderline in October). The remaining cost is main-thread work around the selection (about 250
flag requests while typing in the search box, panel mount) and the 12 uploads, not the globe itself. Time to
interactive was 2.7–4.4 s against a 3 s budget. These budgets are therefore not enforced in CI (software GL only).
