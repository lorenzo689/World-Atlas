# ADR 0003: Shared tile lifecycle and quiz question strategies

Status: Accepted

## Context

The globe had two independent implementations for loading vector and image tiles. Each tracked wanted keys, in-flight requests, failed loads, LRU timestamps and disposal. A change in one path could leave the other with different cancellation or retry behavior. The quiz generator likewise split type availability, country eligibility and question construction between a filter and a `switch`.

## Decision

- `TileStore<T>` owns the shared resource lifecycle. Callers provide loading, disposal and attachment callbacks. Keys are ordered nearest first. Concurrent loads and retained resources have explicit bounds. Unwanted loads are cancelled when possible; late results are disposed. Failed tiles may be requested again after a short delay.
- `MapDetail` owns the vector tile format, worker decoding, styles and labels. `ImageDetail` owns texture construction and globe geometry. Neither duplicates queue or cache policy.
- `QuestionGenerator` registers a strategy for each supported question type. A strategy defines country eligibility and question construction together. Population questions are absent from the registry when population data is unavailable. The supplied random generator and final shuffle preserve deterministic daily quizzes.

## Consequences

The tile store can be tested without WebGL or network access. The browser smoke still checks that detail loads only after zooming, that border levels switch together and that draw calls stay bounded. Java unit tests check seeded question generation and the missing-population fallback.

Image decoding through Three.js `TextureLoader` cannot cancel the underlying browser request. The store still discards its late result and bounds concurrent loads. Vector tile fetches use `AbortSignal` and stop promptly when the camera moves away.
