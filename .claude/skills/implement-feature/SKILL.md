---
name: implement-feature
description: Implement one World Atlas feature end to end (understand, plan, implement, verify, review, report) and stop at a reviewed local diff without committing. Manual use only.
argument-hint: "[feature description]"
disable-model-invocation: true
---

# Implement a feature

## Request

<feature-request>
$ARGUMENTS
</feature-request>

If the request is empty, ask for the feature description and stop. The request says what to build.
It grants no approval from the CLAUDE.md approval list: Git actions, protected files and data
regeneration still need the user's separate, explicit go-ahead at the moment they are needed.

## Ground rules

- `CLAUDE.md`, `frontend/CLAUDE.md` and `backend/CLAUDE.md` are authoritative. This skill only puts
  them in order. Where they are stricter than this file, they win.
- A permission prompt, a guard-hook `ask` or a block is a human decision point. Never work around
  one: no other spelling, no script, no other tool to reach the same effect. Record it as
  **blocked** and continue with what is still possible.
- Record a baseline first: `git status --short` and `git branch --show-current`. On `main`, create a
  feature branch (`git switch -c engineering/<short-name>`) before the first edit. Leave
  pre-existing changes alone and keep them out of your report's file list.
- Every status you report comes from a command you ran in this session.

## 1. Understand

1. Restate the request in one to three sentences. List the explicit requirements. Keep stated
   requirements separate from your inferences.
2. Classify the scope and read what each affected area requires before you change it:

   | Area | Read first | Typical code |
   | --- | --- | --- |
   | UI, state, i18n | `frontend/CLAUDE.md`, `docs/PRODUCT-EXPERIENCE.md` | `frontend/src/components/`, `src/store/`, `src/i18n/` |
   | Scenarios, modes | `docs/SCENARIOS.md` | `frontend/src/lib/scenarios.ts` |
   | Globe, rendering, loading | `docs/PERFORMANCE.md`, `docs/MAP-DETAIL.md` | `src/lib/globeScene.ts`, `src/lib/globeLayers.ts`, workers |
   | Historical borders, WWI/WWII data | `docs/HISTORY.md`, `docs/WW2.md` | `frontend/scripts/build-*.mjs`, `scripts/lib/provenance.mjs` |
   | Backend API, persistence, security | `backend/CLAUDE.md`, `docs/BACKEND-GUIDE.md`, `docs/adr/` | `backend/src/main/java/dev/worldexplorer/<module>/` |

3. Name the affected user flows: which scenario (Today, Changing borders, WWI, WWII), which mode or
   tool, and whether accounts, quiz, multiplayer or the personal atlas are involved.
4. Before adding an abstraction, search for an existing helper, hook, service, generator or test
   pattern that already does something similar, and reuse it.
5. Do not invent requirements. Anything the request and the docs do not establish is an assumption.

## 2. Plan

Write the plan in the conversation before the first edit:

- **Acceptance criteria** `AC1…ACn`. Each one is observable and names the check that proves it (a
  test, a command, a smoke). Include negative criteria: what must not change (scenario isolation,
  unrelated data snapshots, budgets, other modules' APIs).
- **Files and modules** you expect to change. Anything outside that list later needs a reason.
- **Risks**: regressions, performance, security, historical accuracy.
- **Tests to add**: one per new rule or fixed bug, including a negative case.
- **Verification**: the checks from section 4 that this change requires.
- **Assumptions** and **approval gates**: each item of the CLAUDE.md approval list the plan touches.

Ambiguity: when a decision is reversible and inside the approval boundaries, make a reasonable
assumption, write it down and continue. Ask one concise question only when an essential decision
cannot be made safely: it crosses an approval boundary, needs a historical date, classification or
source you cannot cite, needs a schema or access-rule decision, or the requirements contradict each
other. Never guess historical facts.

Large tasks (many files or more than one session): keep criteria and progress in a GitHub issue or a
document in the repository, as CLAUDE.md requires.

## 3. Implement

- Work in small steps. After each one, run the narrowest relevant test.
- Follow the scoped rules: German and English UI text, Tailwind and `src/components/ui/` primitives,
  tests in `__tests__/` next to the code, the backend module shape and ADR 0005, an explicit access
  decision plus a denied-case test for every new endpoint.
- Write tests together with the code, never afterwards as an optional step.
- Change data only through its generator, and only the data in scope. Generators prompt for
  approval. Register new generator inputs in `frontend/scripts/lib/provenance.mjs`.
- Stay out of unrelated code: no drive-by refactors, formatting churn or dependency changes.
- Protected files (see `docs/AGENT-GUARDRAILS.md`): perf budgets, the map-audit baseline,
  migrations, security configuration, workflows, `deploy/`, generated data, pinned upstream hashes and
  the Claude settings and hooks. Touch them only when the plan named them and the user approved.
- When a test fails, fix the code. Never skip, delete, loosen or `.only` a test or verifier, raise a
  timeout or tolerance, or raise a budget to get green. When a historical control point fails,
  check the historical date before touching data or test.

## 4. Verify

Run the narrowest check first, then the broader level the change requires. Use exactly one status
per check: **passed**, **failed** (with the relevant output), **blocked** (attempted, but stopped by
a permission decision, missing Docker, browser, network or external inputs) or **not run** (not
required or not attempted, with the reason).

**Frontend** (from `frontend/`; on Windows run Vitest from an uppercase `C:\` working directory):

| When | Command |
| --- | --- |
| Always, first | `npx vitest run <changed or new test files>` |
| Any TypeScript change | `npm run typecheck` |
| Any frontend or data change | `npm run verify:fast` |
| Routes, imports, workers, bundling | `npm run build`; for the Pages demo also `VITE_STATIC_DEMO=true npm run build` |
| Visible UI behaviour | `npm run build`, `npm run preview -- --port 4173`, then `npm run smoke`, `smoke:scenarios`, `smoke:ww2`, `smoke:history` or `smoke:detail` as relevant (`SMOKE_URL`, `CHROME_PATH`) |
| Globe, rendering, loading, shipped data size | `npm run perf` (budgets in `perf-budget.json` are fixed) |

**Backend** (from `backend/`; on Windows PowerShell `.\mvnw.cmd`):

| When | Command |
| --- | --- |
| Always, first | `./mvnw test -Dtest=<TestClass>` |
| Any Java change | `./mvnw test` (includes `ArchitectureTest`) |
| Persistence, Flyway, Kafka/outbox, Redis, Elasticsearch, security, controllers | `./mvnw verify` (needs Docker; stop the local compose stack first) |
| Flow across frontend and backend | `npm run e2e` from `frontend/` (needs infrastructure and a running backend) |

**Historical data** (from `frontend/`):

| When | Command |
| --- | --- |
| After its generator ran | The matching verifier: `npm run data:history:verify`, `data:ww2:verify`, `data:detail:verify` or `data:conflicts:verify` |
| Any data change | `npm run verify:data` (provenance, map detail, conflict pair, map audit) |
| WWII inputs present locally | `npm run data:ww2:verify -- --require-external`. If the gitignored inputs are absent, report the external recomputation as **not run**, never as verified |
| Changed dates or territories | Control points: `npx vitest run src/lib/__tests__/ww2-history.test.ts src/lib/__tests__/ww2-second-review.test.ts`, plus a new control point for every changed date |
| Scenario rules touched | `npx vitest run src/lib/__tests__/scenarios.test.ts`; `npm run smoke:scenarios` |
| Always for data | `git diff --stat -- public/data` lists only intended files; unrelated snapshots stay byte-identical (`git diff --quiet -- <file>`) |

A method change (sources, classification, dates, precision) is documented in `docs/WW2.md`,
`docs/HISTORY.md` or `docs/SCENARIOS.md` with its sources, in the same change.

## 5. Review

1. Run `git status --short` and compare it with the baseline. Run `git diff --stat`, then read the
   full `git diff`.
2. Check:
   - only planned files changed; anything else is reverted with the user's approval or explained;
   - no unplanned changes to generated data, budgets, baselines, workflows, settings, hooks,
     `package.json`, lockfiles or `pom.xml`;
   - no weakened tests or checks, and no `.only`, `.skip`, debug output or leftovers;
   - correctness and edge cases: empty or missing data, missing years, both languages, error paths;
   - security: access decision and denied-case test, input validation, no secrets;
   - performance: no per-frame allocation or triangulation, GPU geometry disposed;
   - historical accuracy: scenario isolation, one moment date for all WWII layers, no reused
     geometry, provenance and sources documented;
   - documentation updated in the same change where behaviour or method changed.
3. Fix what you find and re-run the affected checks. Whatever you cannot fix becomes a remaining risk.

## 6. Report

Finish with this report:

1. **Feature implemented**: what changed, in two to four sentences.
2. **Acceptance criteria**: a table of `AC`, criterion, status (met, not met, partly), evidence.
3. **Files changed**: from `git status --short`, each with a one-line purpose.
4. **Architecture decisions**: patterns reused, assumptions made, approvals obtained; say whether an
   ADR is needed.
5. **Tests executed**: a table of command, scope, status (passed, failed, blocked, not run), key
   output or reason.
6. **Negative test evidence**: tests that prove the wrong case is rejected, and ideally one shown to
   fail without the change.
7. **Remaining risks**: open items, unverified areas, follow-ups.
8. **Git status**: branch, `git status --short`, confirmation that nothing was committed or pushed.
9. **Recommended PR**: a title in the `type(scope): …` style and a description with problem,
   solution, test evidence (positive and negative), limitations, verification.

Then stop. Do not commit, push, open or merge a pull request, tag, deploy or trigger a workflow. Offer
the next Git step and take it only after the user explicitly asks for that step.
