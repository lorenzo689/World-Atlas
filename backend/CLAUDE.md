# Backend instructions

Run commands from `backend/` (`./mvnw`, on Windows `mvnw.cmd`). Global workflow and approval rules:
[../CLAUDE.md](../CLAUDE.md). The full guide (German) is `docs/BACKEND-GUIDE.md`.

## Architecture

Java 25, Spring Boot 4.1, one deployable organised as a **modular monolith**: each top-level
package under `dev.worldexplorer` is a module (`achievement`, `activity`, `atlas`, `auth`,
`conflict`, `country`, `indicator`, `multiplayer`, `quiz`, `search`) on top of `common`
(security, errors, events, Redis helpers, web config).

- Module shape: `XyzController` → `XyzService` (logic, transactions) → `XyzRepository` (Spring Data
  JPA, or JDBC for analytics) + `XyzDtos` (records). Services return DTOs (`open-in-view: false`).
- Modules talk through services or events; cross-module side effects go through the
  transactional outbox → Kafka (`docs/adr/0002-outbox-recovery.md`).
- **ADR 0005**, enforced by `src/test/java/dev/worldexplorer/ArchitectureTest.java`:
  no cycles between modules; `common` depends on no feature module. Resolve a violation with the
  patterns in the guide (interface owned by `common` and implemented by the module, beans
  registered by the owning module, endpoint in the module that owns the logic), never by
  weakening the rule. A **new module** must be added to the `commonDoesNotDependOnModules` list.
- Errors are RFC 9457 problem details with a stable `code` (`GlobalExceptionHandler`,
  `ApiException`); validate request records with Bean Validation.

## Persistence

- Flyway owns the schema (`src/main/resources/db/migration/V1…V6`); Hibernate only validates
  (`ddl-auto: validate`). A schema change is a **new** migration `V<next>__<name>.sql`; never edit
  an applied migration. Migrations need approval.
- Use `@Version` where concurrent edits matter; JDBC/SQL for analytics queries.
- PostgreSQL is the system of record; Redis, Kafka and Elasticsearch data can be rebuilt from it.

## Security

`common/security/SecurityConfig.java` holds the access rules. Short-lived JWT access tokens plus an
HttpOnly `SameSite=Strict` refresh cookie; WebSocket clients authenticate on STOMP CONNECT
(`JwtChannelInterceptor`). `/api/admin/**` and `/api/analytics/**` require a verified admin looked
up through `AdminDirectory`; `/api/atlas/**` requires `ROLE_USER` (and a verified email when
configured), so guests are excluded; everything not listed is authenticated. Every new endpoint needs an explicit access
decision and a test for the denied case. Changes to authentication, authorization, CORS/CSP,
rate limits or token handling need approval and an integration test.

## Tests

| Command | Runs | Needs | When |
| --- | --- | --- | --- |
| `./mvnw test` | unit tests (`*Test`) incl. `ArchitectureTest` | JDK 25 | Every Java change; fast loop |
| `./mvnw verify` | above plus integration tests (`*IT`, failsafe) | Docker | Persistence, Flyway, Kafka/outbox, Redis, Elasticsearch, security, controllers, before a PR touching backend behaviour |

- Integration tests extend `support/IntegrationTest`: the whole app on a random port against
  PostgreSQL, Redis, Kafka and Elasticsearch started by `support/TestcontainersConfig`
  (`@ServiceConnection`); only the World Bank client is mocked. They do not use `docker-compose.yml`.
  Wait for asynchronous effects with Awaitility, not sleeps.
- Containers are memory-hungry: on a small machine stop the local compose stack
  (`docker compose stop`) before `./mvnw verify`.
- If Docker is unavailable, report the integration tests as not run.
- CI runs `./mvnw -B verify` (`.github/workflows/ci.yml`); the e2e job runs the packaged jar with
  `docker compose up postgres redis kafka elasticsearch`.

## Needs human approval

The root list applies (migrations, security, dependencies, infrastructure, Git). In addition:
new modules or changes to the `ArchitectureTest` rules (ADR); changes to Kafka topics or event
contracts consumed by other modules; production configuration in `application-prod.yml` or `deploy/`.
