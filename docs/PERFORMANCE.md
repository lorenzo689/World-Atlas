# Performance

How to measure, what the budgets are, what was changed and where we stand.

## 1. Measure

### Live overlay

Open any page with `?debug=1` (e.g. `http://localhost:5173/?debug=1`). A small overlay (bottom left) shows a rolling
window: render rate, frame p50/p95, **draw calls**, triangles, geometries, textures, shader programs, long tasks and JS
heap. Use it on real devices (phone via remote debugging, laptop with integrated GPU) while rotating the globe.

With `?debug=1` the adaptive quality governor is off, so numbers are reproducible. Add `&adaptive=1` to turn it back on.
`window.__perf.snapshot()` / `.reset()` expose the same numbers to scripts.

> The globe renders **on demand**: while nothing moves, no frames are produced, so "fps" is the render rate, not the
> display refresh rate.

### Scripted run

```bash
npm run build
npm run perf                                  # software GL: draw calls, transfer size
npm run perf -- --gpu                         # real GPU: also frame-time, ready time, long-task and heap budgets
npm run perf -- --label my-change             # result in perf-results/my-change.json
npm run perf -- --shots perf-results/shots    # also save screenshots (satellite, hover, selected, political, data)
npm run perf -- --width 390 --height 844 --dpr 3 --cpu 4   # phone-like
```

Scenario: load → settle 4 s → **idle** 3 s → **drag** (90 mouse moves) → **hover** sweep (120 moves) → **select**
(via the search box, 3.5 s). Each phase reports renders/s, frame p50/p95/max, long tasks, draw calls, triangles,
geometries, textures, heap. Results are compared against `perf-budget.json`; the process exits non-zero on a miss.

> Software GL (SwiftShader, the default) is ~50× slower than a GPU and every software-rendered frame counts as a
> long task. Use it for **relative** comparisons and hardware-independent metrics (draw calls, bytes, geometry
> counts). Frame times, ready time and long tasks are only enforced with `--gpu` on real hardware.

## 2. Budgets (`perf-budget.json`)

| Metric | Limit | Enforced |
| --- | --- | --- |
| Draw calls, worst phase | 60 | always |
| Transfer size at load | 3 MB | always |
| Ready (globe interactive) | 3 s | `--gpu` |
| Long-task time per phase | 200 ms | `--gpu` |
| Frame p95 | 20 ms | `--gpu` |
| Frame max | 100 ms | `--gpu` |
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
| Startup | Shader warm-up behind the loading veil; globe chunk is requested immediately (parallel to the data); sky + data preloaded in `index.html`. |
| Boundaries | TopoJSON topology (shared borders once), topology-aware simplification (80.6k → 64.1k points, tiny islands protected), 0.01° precision. |
| Geometry | Country caps are triangulated at build time (`public/data/geometry.{bin,json}`): in-browser tessellation took ≈8 s of main-thread time. |
| Textures | WebP, resized: colour 4096 (604 KB) / 2048 (192 KB), bump 40 KB, specular 75 KB, sky 44 KB (was 3.2 MB in JPG/PNG). Textures are cached and disposed. |

## 4. Results

Software GL, 1280×800, same scenario. "Before" is the original code (measured with an earlier manual profile run).

| | Before | After merging the map (draw-call fix) | Now |
| --- | ---: | ---: | ---: |
| Draw calls, idle / drag | ≈4,800 | 4 / 7 | 4 / 4 |
| Draw calls, hover (multi-island country) | ≈4,800 | 385 | 4 |
| Geometries alive during hover | – | 258 | 17 |
| Hover long-task time | – | 25.7 s | see note |
| Ready (software GL) | – | 43 s | ≈5 s |
| Transfer at load | ≈4.3 MB | 4.3 MB | 2.9 MB* |
| Globe JS chunk | 1,917 KB (535 KB gz) | 1,917 KB | 626 KB (161 KB gz) |

\* `geometry.bin` (1.45 MB raw, ≈670 KB gzipped) is reported uncompressed by `vite preview`; serve `.bin` with
compression in production. Textures + boundaries are ≈1.0 MB, the JS ≈0.3 MB.

Note: in software GL each rendered frame (~200 ms) counts as a long task, so the long-task column only says
something with `--gpu`. Re-measure on real hardware before relying on it.

## 5. Not done / ideas

- **KTX2 / Basis textures**: needs `toktx`/`basisu`, not available here. WebP is the interim.
- **Packing bump + specular into one texture**: needs a custom shader; the two 8-bit WebP maps are small.
- **LOD (1:110m while zoomed out)**, **raster ID-buffer picking**: picking is already ≪1 ms, LOD not needed yet.
- **Highlight side walls** (the translucent wall under a raised country) were dropped; the raised cap + outline remain.
- **Fonts** (Inter + Instrument Serif subsets) and route-level bundle analysis for the country pages are untouched.
- `geometry.bin` could shrink (Uint16 indices per country, quantised lng/lat) if its size matters.
