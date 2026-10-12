# World Explorer

An interactive 3D atlas: a fullscreen Earth you can rotate and zoom, click any country for a quick card,
and open detailed pages with population, economy and geography data from the World Bank.

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Radix) · react-globe.gl / Three.js · Recharts · React Router

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # vitest
npm run data       # regenerate public/data + public/flags (see below)
```

## What's in it

| Area | Notes |
| --- | --- |
| Globe | NASA Blue Marble texture, bump + ocean specular, atmosphere, 1:50m borders, hover highlight, animated fly-to framed by country size, idle auto-rotate (paused for `prefers-reduced-motion`). |
| Modes | **Satellite**, **Political** (regional palette), **Data** (quantile choropleth of 9 World Bank indicators; year shown on hover). |
| Search | ARIA combobox, diacritic-insensitive, matches names, capitals and ISO codes. `/` or `Ctrl/Cmd+K` focuses it. |
| Preview | Desktop side panel / mobile bottom sheet (drag or tap handle) with flag, capital, population, area, currency, languages, neighbours. The globe re-centres the country in the free area beside the panel. |
| Country pages | `/countries/:code/:tab?` (alpha-2 or alpha-3, canonicalised to alpha-3). Tabs: overview, population, economy, geography. |
| State | Zustand store keeps mode, data metric, selection and last camera pose, so leaving to a country page and coming back restores the view. |
| SEO | Per-page `<title>`, description, canonical, Open Graph and JSON-LD; `sitemap.xml` and `robots.txt` are generated. |

## Data and sources

Nothing is invented: missing values render as `—` or an explicit empty state, and every chart shows its data years and source.

- **Statistics**: [World Bank Open Data](https://data.worldbank.org) API (CC BY 4.0), fetched live in the browser and cached per session.
- **Country metadata**: [mledoze/countries](https://github.com/mledoze/countries) (ODbL), snapshotted in `scripts/source/countries.json`.
  (REST Countries v3.1 is deprecated and v5 needs an API key, so it isn't used.)
- **Boundaries**: Natural Earth 1:50m via `world-atlas` (public domain).
- **Flags**: `flag-icons` (MIT), copied to `public/flags`.
- **Descriptions**: Wikipedia REST summary API (CC BY-SA), attributed on the page.
- **Textures**: three-globe example imagery (NASA Blue Marble), copied to `public/textures`.

`npm run data` rebuilds `public/data/{countries,boundaries}.json`, `public/flags`, `sitemap.xml` and `robots.txt`.

## Structure

```
src/
  components/ globe/ (GlobeView, controls, preview, bottom sheet)
              country/ (tabs, map, locator globe, flag)
              charts/ ui/ layout/
  hooks/      data loading (countries, boundaries, indicators), media queries, document meta
  lib/        World Bank + Wikipedia clients, formatting, search, geo framing, colour scales
  store/      zustand explorer state
  pages/      ExplorerPage, CountryPage
```

## Known limitations

- SEO metadata is set client-side (SPA); crawlers that don't run JS will see the generic shell. Pre-rendering would be the next step.
- `sitemap.xml` uses a placeholder origin (`world-explorer.example`); edit `scripts/build-data.mjs` before deploying.
- 14 small territories have no polygon in the 1:50m dataset (e.g. Gibraltar, Réunion). They are searchable and the camera flies to their coordinates, but no shape is highlighted.
- Country borders follow the Natural Earth dataset and carry no political endorsement.
- The WebGL chunk is large (~1.9 MB, three.js); it is lazy-loaded so country pages stay light.
