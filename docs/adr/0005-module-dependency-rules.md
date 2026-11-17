# ADR 0005: Enforced module dependency rules

Status: accepted · 2026-11-16

## Context

The backend is a modular monolith: each top-level package (`atlas`, `search`, `quiz`, ...) is a module.
The rule "modules talk through services or events" existed only in the guide. A bytecode analysis
found five dependency cycles: `atlas ↔ search`, `activity ↔ search`, and `common` depending on
`auth`, `country` and `indicator`, which in turn depend on `common`. Cycles make modules impossible
to understand, test or extract on their own, and they grow silently because nothing fails.

## Decision

Enforce two rules with ArchUnit in `ArchitectureTest` (a plain unit test, no Spring context or Docker):

1. Top-level modules are free of cycles.
2. `common` depends on no feature module.

The existing violations were removed without behaviour changes:

- `SecurityConfig` asks an `AdminDirectory` interface owned by `common`; `auth` implements it.
- Modules register their own Redis caches (`RedisCacheManagerBuilderCustomizer` per module) and
  Elasticsearch indices (`SearchIndex` beans collected by `IndexBootstrap`).
- The note search endpoint moved to `search/NoteSearchController`; the URL `/api/atlas/notes/search`
  and its access rule are unchanged.

## Consequences

New cycles fail the build with the offending classes listed. Stricter rules (for example "repositories
are only used inside their module") are not enforced yet: `activity` and others read
`AppUserRepository` directly. Adding such a rule first requires a public query service in `auth`.
Spring Modulith would offer the same checks plus module documentation, but would add a framework
dependency for what two ArchUnit rules already cover.
