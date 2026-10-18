# ADR 0004: Indicator source and atomic ingestion transitions

## Context

The ingestion pipeline coupled the write side directly to the World Bank HTTP client. Its monitor
could also mark a run failed after another instance had completed it, and inserted its outbox event
outside the state-change transaction. An empty run completed without an event.

## Decision

- `IndicatorSource` is the ingestion port. `WorldBankClient` adapts the World Bank API to that port.
- `CircuitBreakingIndicatorSource` decorates the retried client. After three failed fetches it
  rejects new calls for one minute, then permits one probe. This bounds avoidable upstream load.
- `IngestionRunTransitions` owns run state changes. Conditional SQL updates implement the state
  machine; an update affecting zero rows means another worker already won or the state changed.
- Terminal state changes and `IndicatorIngested` outbox inserts share one database transaction.
  Empty runs emit a success event as well.
- Kafka consumers commit value upserts and unique per-run receipts in one PostgreSQL transaction.
  The monitor counts receipts, so redelivered batches do not inflate completion progress.
- Terminal-run receipts older than seven days are pruned in bounded hourly batches.

## Consequences

Provider changes do not require changes to the Kafka publishing pipeline. Retried failed fetches
are counted as one failure by the outer circuit breaker. Duplicate timeout/completion events are
prevented by the database transition guard. A circuit opened by one application instance is local
to that instance; Redis locking still prevents duplicate fetches across instances.
