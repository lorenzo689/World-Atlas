# ADR 0002: Durable event delivery during Kafka outages

Status: accepted · 2026-10-17

## Context

Publishing a database change and a Kafka event in separate steps can lose an event after a process crash. The existing transactional outbox solved durability but retried every 300 ms; a brief broker outage could exhaust 20 attempts before recovery.

## Decision

Retain the transactional outbox and mark rows sent only after Kafka acknowledges them. Add `next_attempt_at` and a capped exponential delay after each failure (1, 2, 4, 8, 16, 32, then 60 seconds). Expose pending, exhausted and oldest-age metrics; alert on lag and exhaustion. Keep admin retry conditional on an exhausted unsent row. Test the failure/recovery path with PostgreSQL and a failing Kafka template; provide a local Compose drill for a real broker outage.

## Consequences

Events survive temporary outages and avoid hot retry loops. Delivery remains at least once, so consumers need idempotency. A long outage can still exhaust attempts and requires operator review. The retry schedule does not replace broker monitoring.
