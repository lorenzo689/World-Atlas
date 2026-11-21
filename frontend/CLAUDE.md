# Frontend instructions

Run every command from `frontend/`. Global workflow and approval rules: [../CLAUDE.md](../CLAUDE.md).

## Conventions

- React 19 function components, TypeScript `strict` with `noUnusedLocals`/`noUnusedParameters`.
  Import from `src/` through `@/` (`@/lib/geo`). `npm run typecheck` covers `src/` only; scripts in
  `scripts/` are plain ESM `.mjs` and are covered by their tests.
- UI text exists in German and English (`src/i18n/de.ts`, `src/i18n/en.ts`, or inline `{ de, en }`
  records in data). Add both.
- Styling: Tailwind v4 and the Radix/shadcn primitives in `src/components/ui/`.
- Tests sit next to the code in `__tests__/` (Vitest, jsdom). Script tests in
  `scripts/lib/__tests__/` start with `// @vitest-environment node`. Run a single file with
  `npx vitest run <path>`.
- Windows: run Vitest from a shell whose working directory has an uppercase drive letter
  (`C:\…`); a lowercase `c:\…` makes Vite load Vitest twice and every suite fails.

## State

Zustand stores in `src/store/`: `auth.ts` (access token in memory only, never persisted) and
`explorer.ts` (mode, metric, selection, camera pose; persisted). The camera pose is written on every
camera change and must not be subscribed to by components. Scenario state lives in the URL and in
the explorer instance mounted per scenario; data hooks are in `src/hooks/`.

## Globe rendering

- `src/lib/globeScene.ts` (`GlobeScene`) owns the WebGL renderer, camera, controls, textures and
  render loop; `src/lib/globeLayers.ts` (`BaseLayers`) builds country caps and borders.
- `src/components/globe/GlobeView.tsx` creates one scene and drives it imperatively
  (`replaceMap`, `setSatellite`, `requestRender`, …). React does not render per frame.
- Rendering is on demand (`requestRender`). Triangulation and polygon work run in Web Workers
  (`territories.worker.ts`, `historyAreaDiff.worker.ts`, `mapDetail.worker.ts`, `osmBorders.worker.ts`).
- Dispose GPU geometry when a snapshot is replaced or the scene is destroyed; reuse it for
  visibility changes. No per-frame polygon triangulation, allocation or React state updates.
- Budgets: `perf-budget.json`, explained in `docs/PERFORMANCE.md` (draw calls, transfer size,
  WWII view size always enforced; frame/heap limits with `--gpu`). Run `npm run perf` for changes
  to rendering, loading or shipped data size. **Never raise a budget without approval.**

## Scenario isolation

`src/lib/scenarios.ts` is the policy: Today, Changing borders (1886–2019), WWI (1914–1918),
WWII (1939–1945), each with its own years, modes and capabilities. Rules (`docs/SCENARIOS.md`):

- Historical scenarios never show modern conflict layers or modern indicator data, and never call
  the current-conflict API. Only Today has `conflicts` and `modernData`.
- Changing presentation mode or a tool never changes the scenario.
- All WWII layers (state borders, occupation areas, fronts) use the **same moment date**.
- Occupation/control and sovereignty are different concepts: the territory layer is independent of
  borders and carries actor, kind, precision, date and source per feature.
- Missing years or regions stay unshaded; never reuse another year's geometry.

Covered by `src/lib/__tests__/scenarios.test.ts` and `npm run smoke:scenarios`.

## Historical data

Generated JSON in `public/data/` is committed. Large upstream downloads under `scripts/source/`
(CShapes, OHM, atlas sheets, detail, conflicts) and `scripts/data/ww2-occupation.json` with its
`occupation-cache/` are gitignored (see `.gitignore`); small hand-maintained inputs there are
committed. Change data only through its generator, never by hand.

| Data | Generator | Verifier | Doc |
| --- | --- | --- | --- |
| Countries, boundaries, geometry | `npm run data` | CI rebuild + `git diff`, `audit:map` | `docs/MAP-ACCURACY.md` |
| Historical topology 1886–2019 | `npm run data:history` | `data:history:verify` | `docs/HISTORY.md` |
| WWII Reich borders → base map | `npm run data:ww2`, then `npm run data:history` | `data:history:verify` | `docs/HISTORY.md` |
| WWII fronts (atlas) | `npm run data:ww2:atlas` | tests, `smoke:ww2` | `docs/WW2.md` |
| WWII/WWI territories | `npm run data:ww2:occupation`, then `npm run data:territories` | `data:ww2:verify` | `docs/WW2.md` |
| Close-zoom detail | `npm run data:detail` | `data:detail:verify` | `docs/MAP-DETAIL.md` |
| Present-day conflict pair | `npm run data:conflicts` (Pages: `data:conflicts:refresh`) | `data:conflicts:verify` | `docs/DEPLOY.md` |

Invariants:

- Generated data must pass its verifier, and `npm run verify:data` before review.
- A historical change must leave unrelated snapshots byte-identical; check `git diff --stat public/data`.
- Gitignored external inputs that are absent are reported as **not recomputed**; never claim
  them as verified. Use `data:ww2:verify -- --require-external` when they are present.
- When a generator reads a new input, register it in `scripts/lib/provenance.mjs`.
- Pinned upstream hashes, classifications and dates change only with sources and approval.
- Historical control points (`ww2-history.test.ts`, `ww2-second-review.test.ts`): when one fails,
  check the historical date before changing data or test.

## Browser checks

Build, then serve and smoke-test in two terminals:

```sh
npm run build && npm run preview -- --port 4173
SMOKE_URL=http://localhost:4173/explore npm run smoke:scenarios   # also smoke:ww2, smoke:history
```

`CHROME_PATH` selects the browser, `SMOKE_URL` the app. CI runs `smoke`, `smoke:scenarios` and
`smoke:ww2` in the frontend job, and `e2e`, `smoke:history` and `smoke:detail` in the e2e job with
the backend; `pages.yml` runs the history, WWII and scenario smokes against the static demo.
