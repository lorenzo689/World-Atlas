# World Atlas: instructions for coding agents

World Atlas ("World Explorer") is an interactive 3D atlas and geography learning platform: a Three.js
globe with present-day data, historical borders 1886–2019 and dated World War I/II learning views,
plus a Spring Boot backend for accounts, quizzes, multiplayer, a personal atlas and a data platform.
Historical accuracy and source provenance are product requirements, not polish.

Scoped rules: [frontend/CLAUDE.md](frontend/CLAUDE.md) and [backend/CLAUDE.md](backend/CLAUDE.md).

## Repository map

| Path | Contents |
| --- | --- |
| `frontend/` | React 19 + TypeScript + Vite app, Three.js globe, data generators and verifiers in `frontend/scripts/`, generated data in `frontend/public/data/` |
| `backend/` | Java 25 / Spring Boot 4.1 modular monolith (PostgreSQL, Redis, Kafka, Elasticsearch), Flyway, Testcontainers |
| `docs/` | Authoritative documentation; decisions in `docs/adr/` |
| `.github/workflows/` | `ci.yml` (frontend, backend, e2e), `pages.yml` (static demo), `publish-images.yml` (tags/manual only) |
| `deploy/`, `docker-compose.yml`, `monitoring/`, `loadtest/` | Production compose + Caddy, local infrastructure, Grafana/Prometheus, k6 |

## Authoritative documentation

Read the relevant document before changing its area; update it in the same change. Do not copy its
content into these files.

| Topic | Document |
| --- | --- |
| Product, scenarios, user flow | `docs/PRODUCT-EXPERIENCE.md`, `docs/SCENARIOS.md` |
| Historical borders, conflict data pipeline | `docs/HISTORY.md` |
| World War II method, sources, audits, provenance | `docs/WW2.md` |
| Map geometry quality, close-zoom detail | `docs/MAP-ACCURACY.md`, `docs/MAP-AUDIT.md` (generated), `docs/MAP-DETAIL.md` |
| Performance budgets and measurements | `docs/PERFORMANCE.md`, `frontend/perf-budget.json` |
| Backend architecture (German) | `docs/BACKEND-GUIDE.md`, `docs/adr/0005-module-dependency-rules.md` |
| Deployment, Pages conflict-data policy (German) | `docs/DEPLOY.md` |
| Security | `docs/SECURITY-AUDIT.md` |
| Architecture decisions | `docs/adr/0001`–`0005` |

## Workflow: Understand → Plan → Implement → Verify → Review → Report

Feature protocol (every non-trivial task):

| Phase | Steps |
| --- | --- |
| Understand | 1. Read the task requirements. 2. Inspect the relevant docs, architecture and existing code; look for an existing helper, pattern or script before adding an abstraction. |
| Plan | 3. Define measurable acceptance criteria. 4. Identify affected modules, risks and the checks that will prove the result. |
| Implement | 5. Implement in small, independently verifiable steps; keep unrelated files untouched. 6. Add regression tests for each fixed bug and new rule, including negative cases. |
| Verify | 7. Run the narrowest relevant check (single test file, one verifier). 8. Run the broader level the change requires (table below). |
| Review | 9. Read the actual `git diff` and `git status`: only intended files, no accidental data changes, no weakened checks, no leftovers. |
| Report | 10. Files changed; acceptance criteria met or not; commands run with real results; negative evidence; limitations and follow-ups. |

Never claim a check passed without running it in this session. Report failures with their output.
A check that could not run (missing Docker, missing external input, no network) is reported as
"not run", never as passed. For long tasks, keep durable state (criteria, progress, open questions)
in a GitHub issue or a document in the repository, not only in the conversation.

## Choosing verification

Run from `frontend/` unless noted. `verify:fast` is a local gate, **not** a substitute for CI.

| Level | Command | Use for |
| --- | --- | --- |
| Fast local | `npm run verify:fast` | Default for any frontend or data change: `verify:data`, `typecheck`, `npm test` |
| Data only | `npm run verify:data` | Committed data: history, WWII provenance, map detail, conflict pair, map audit. Regenerates nothing; leaves the tree unchanged. CI runs this same command (sequence in `frontend/scripts/lib/verify-data.mjs`) |
| Strict WWII | `npm run data:ww2:verify -- --require-external` | After regenerating WWII data locally; needs the gitignored upstream inputs (`docs/WW2.md`) |
| Production build | `npm run build` (and `VITE_STATIC_DEMO=true npm run build` for the Pages demo) | Bundling, routes, static demo |
| Browser | `npm run smoke`, `smoke:scenarios`, `smoke:ww2`, `smoke:history`, `smoke:detail` | UI behaviour; need a running app (`SMOKE_URL`, `CHROME_PATH`) |
| Performance | `npm run perf` | Rendering, data size, loading changes; budgets in `perf-budget.json` |
| Backend unit + architecture | `cd backend && ./mvnw test` | Any Java change; no Docker |
| Backend integration | `cd backend && ./mvnw verify` | Persistence, messaging, search, security, API changes; needs Docker |
| Full stack E2E | `npm run e2e` | Cross-cutting frontend/backend flows; needs infrastructure and backend |

Beyond `verify:fast`, CI (`.github/workflows/ci.yml`) rebuilds the country geometry and diffs it,
runs `npm audit --omit=dev --audit-level=high`, the production build, browser smokes, perf budgets,
the backend `verify` and the E2E job, all on Linux. A green `verify:fast` is evidence for review,
not a CI result. A new data verifier is added to `DATA_CHECKS`, not as a separate CI step (a test
enforces this). Never remove, skip or loosen an existing CI gate.

## Architecture changes and decisions

- An architecture change (new module, new dependency direction, new framework or infrastructure,
  new data source, changed data model or schema policy) needs an ADR in `docs/adr/` (next number,
  format of the existing ADRs: context, decision, consequences) and explicit approval.
- Data method changes (sources, classifications, dates, precision) are documented in the topic
  document (`docs/WW2.md`, `docs/HISTORY.md`, `docs/SCENARIOS.md`) with their sources.
- Prefer existing tools. Do not add a dependency, service or orchestration layer that the task does
  not require.

## Git and pull requests

- Default: a feature branch from up-to-date `origin/main` (`engineering/…`, `fix/…`) and a pull
  request. Never commit directly to `main`.
- Commit messages follow the existing style: `fix(history): …`, `feat(…): …`, `docs: …`.
- Stage explicit paths, not `git add -A`; never commit secrets (`deploy/.env`, `.claude/settings.local.json`).
- PR description: problem, solution, test evidence (positive and negative), limitations, verification.
- Merging requires green CI.

## Approval boundaries

This is the single approval list; the scoped files only add area-specific items. Ask before, and do
not do without explicit instruction:

- committing, pushing, force-pushing, merging, tagging, deploying or triggering workflows;
- destructive or history-rewriting Git: `reset --hard`, `clean`, `checkout`/`restore` over
  uncommitted changes, `stash drop`, branch deletion, rebasing or amending published commits,
  rebasing with uncommitted changes;
- destructive local infrastructure: `docker compose down -v`, volume or image pruning, stopping
  containers that belong to other projects;
- commands that download and execute code (`npx <package>` not in the lockfile, install scripts);
- changing pinned upstream hashes or sources, historical classifications or dates;
- regenerating committed historical data outside the task's scope;
- raising performance budgets or loosening any verifier, test or CI gate;
- dependency upgrades, new dependencies, new infrastructure;
- database migrations or edits to existing migrations;
- security configuration, authentication or authorization rules;
- deleting files you did not create, local backups or caches.
