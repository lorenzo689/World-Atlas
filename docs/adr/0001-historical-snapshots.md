# ADR 0001: Annual historical snapshots

Status: accepted · 2026-10-17

## Context

The existing Natural Earth map represents current states. Showing an old flag on a current polygon would present a false historical map. World Bank indicator years and political boundary dates are separate timelines.

## Decision

Use pinned CShapes 2.0 country periods, sample them on 1 January each year from 1886 to 2019, and keep the current map as a separate Today state. Build shared TopoJSON plus precomputed geometry and dated flag references. Publish a SHA-256 manifest and verify generated artifacts in CI. Compare snapshots using shared boundary segment differences and worker-computed polygon differences for continuing states; source period IDs identify entity transitions.

## Consequences

The viewer has reproducible geography and a shareable URL. It cannot show intermediate dates or the years after 2019. Source coding of disputed regions remains visible; labels and flags must not imply greater certainty. CShapes output retains CC BY-NC-SA 4.0 terms.
