# World Explorer: engineering case study

## Problem and user flow

World Explorer began as a current-country 3D globe. A current map cannot answer what a border or flag looked like in an earlier year. The historical viewer now lets a visitor select any annual snapshot from 1886 through 2019, open a sourced event, compare two years side by side, inspect dated flags, and copy the exact comparison URL. The static demonstration starts with Germany in 1989/1991; the full-stack application also supports quiz, multiplayer, personal atlas, indicators and administration.

## Decisions

The underlying records are [ADR 0001](adr/0001-historical-snapshots.md) and [ADR 0002](adr/0002-outbox-recovery.md).

| Decision | Reason | Trade-off |
| --- | --- | --- |
| CShapes 2.0 periods, sampled on 1 January | Reproducible academic border source with exact validity dates | The map is a reconstruction; disputed and dependent territories follow the source's coding. No coverage after 2019. |
| Separate historical and current maps | Current World Bank indicators have a different timeline and entity model | No indicator overlay for historical entities. |
| One shared TopoJSON plus packed precomputed geometry | Neighboring boundaries share arcs; WebGL caps do not need browser triangulation on every year change | The first historical visit still downloads about 12 MiB of geometry. |
| Period changes highlighted in amber | Fast and reproducible comparison from the source identifiers | The color is **not** an exact geometric border difference. |
| Static GitHub Pages demo plus separate full-stack deployment | The map can be viewed without an account or server | GitHub Pages cannot run Spring Boot, Kafka, Redis, PostgreSQL or Elasticsearch. |
| Transactional outbox with scheduled retry | Business writes survive a Kafka outage | At-least-once delivery requires idempotent consumers and an operator path for exhausted events. |

## Reproduction and evidence

- `npm run data:history` pins the source SHA-256 and regenerates the map. `npm run data:history:verify` checks every annual snapshot, overlapping state periods, geometry ranges, flag metadata and output hashes against `historical-manifest.json`.
- `npm test`, `npm run build` and `npm run smoke:history` cover the frontend and real-browser historical flow. `cd backend && ./mvnw verify` runs backend unit and Testcontainers integration tests.
- The geometry artifact went from 18,376,160 to 12,376,220 bytes by storing indices relative to each country period as unsigned 16-bit values. This is a **33% transfer-size reduction** for that file; it is not a measured first-paint improvement.
- `scripts/drill-outbox.ps1` stops local Kafka, creates an actual outbox event through the guest API, checks it stays durable with bounded retries, restarts Kafka in `finally`, and waits for delivery. The [17 October 2026 drill record](DRILL-2026-10-17.md) shows delivery after four attempts. Run it only against the local Compose stack with the updated backend.
- Prometheus rules in `monitoring/alerts.yml` identify backend outage, outbox lag, exhausted events and elevated HTTP 5xx rate. They are visible in Prometheus; external notification routing requires Alertmanager configuration.

## SLO and operations

**Proposed SLO for a deployed full-stack instance:** over a rolling 30-day window, at least 99.5% of valid `/api` requests return a non-5xx response, excluding scheduled maintenance. Outbox delivery should complete within 2 minutes for 99% of events while Kafka is healthy. These are operational targets, **not historical claims**; a public production instance and long-term measurements are still needed. The rule files provide warning thresholds and the drill demonstrates recovery mechanics.

If the outbox lag alert fires: check Kafka and PostgreSQL health, inspect `/api/admin/events/outbox` and the `outbox_*` metrics, restore the broker, then confirm `outbox_pending` and `outbox_oldest_age_seconds` fall. For `outbox_failed > 0`, inspect `lastError`, fix the cause and use the admin retry action. Do not delete unsent rows. For HTTP 5xx, inspect traces in Jaeger and structured backend logs using `X-Request-Id`.

## Security evidence and limits

The backend enforces JWT bearer authentication and roles in `SecurityConfig`; `/api/admin/**` requires `ROLE_ADMIN`. `AuthAndAtlasIT` checks guest and normal-user denial for the outbox read/retry endpoints. Refresh tokens rotate and use an HttpOnly, SameSite cookie; registration and reset flows have integration tests. CI runs a high-severity production npm audit and Dependabot checks npm, Maven and Actions dependencies weekly. This is an evidence map against parts of OWASP ASVS authentication, access-control and dependency-management areas, **not an ASVS certification or complete penetration test**.

Historical data is CC BY-NC-SA 4.0. The public demo attributes CShapes and links flag files to their individual Wikimedia Commons pages. Commercial reuse needs a differently licensed boundary source.
