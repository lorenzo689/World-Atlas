# Security audit — 18 October 2026

Scope: React/Vite client, Spring Boot API and STOMP broker, authentication, data services, CI and the documented single-host deployment. This is a code and automated-test audit, not a penetration test of a live server.

## Findings and fixes

| Severity | Finding | Change and verification |
| --- | --- | --- |
| Critical | The configured bootstrap admin address gained `ADMIN` at registration before mailbox ownership was proved. | Grant only after successful email verification. Integration test checks denial before and access after verification. |
| High | STOMP clients could subscribe to arbitrary broker destinations and receive room events without membership. | Allowlist user queues and member-only room topics; allowlist application SEND destinations; reject expired tokens on every frame. Unit test and full browser notification test cover the routes. |
| High | A room code alone exposed room state and the current flag. | Require a bearer token and current room membership for room details and flags. Integration test checks a nonmember is denied. Public lobby listing stays available. |
| High | Cookie-backed refresh and logout relied on `SameSite=Strict` alone, leaving a fragile CSRF boundary. | Require an exact configured `Origin` for requests carrying the refresh cookie. API clients using a body token are unaffected. Integration test covers missing, hostile and allowed origins. |
| High | The production profile could fall back to a checked-in development JWT secret. | Production now requires `APP_JWT_SECRET`; the JWT key already enforces at least 32 bytes. Production also requires verified email for protected account features. |
| Medium | Search snippets and globe tooltips used HTML string insertion. | Render search highlights as React text nodes and build tooltips with `textContent`; unit test includes an injection payload. |
| Medium | Wikipedia response URLs were trusted as link destinations. | Allow only HTTPS Wikipedia hosts and use a safe fallback URL; unit test covers hostile schemes and domains. |
| Medium | The deployed site lacked browser defense headers. | Caddy sends CSP, HSTS, frame denial, MIME sniffing prevention and a restrictive Permissions Policy. The static GitHub Pages build adds a CSP meta tag. Browser smoke test checks the production build. |
| Low | Login and password recovery accepted unbounded text fields. | Apply length constraints to email, password and API refresh-token input. |

## Security boundaries

- Access JWTs stay in memory; refresh tokens rotate and live in an HttpOnly, Secure (production), SameSite=Strict cookie. Admin endpoints also check current database roles and verified email so an old JWT cannot retain admin power.
- The public GitHub Pages demo contains static map data only. Spring Boot, Redis, Kafka, PostgreSQL and Elasticsearch require the separate deployment. The production Compose file exposes only Caddy on ports 80/443.
- CI runs frontend tests, TypeScript checking, a production npm audit, backend unit/integration tests with real service containers and a full browser test. Dependabot covers npm, Maven and Actions.

## Remaining limits

- GitHub Pages cannot send arbitrary response headers; CSP there is a meta policy and cannot enforce `frame-ancestors`. The Caddy deployment sends the header policy.
- The documented single-host deployment uses unencrypted, unauthenticated Redis/Kafka/Elasticsearch traffic on its private Compose network. A multi-host deployment needs service authentication and transport encryption.
- Short-lived access JWTs for ordinary accounts remain valid until expiry after account role changes; admin access is checked against the database on each request. A global account revocation mechanism would be needed for immediate revocation of every bearer token.
- Automated checks do not establish the absence of vulnerabilities. A deployed instance needs external review, patch monitoring, secret rotation and recovery drills.
