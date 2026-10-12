# client review contract

FindingsPanel owns severity and confidence state for one persisted review. Counts derive from visible cards; click a selected severity to restore that run. Finding actions persist via useFindingAction. PR list previews contain no mutation controls. RunCostBadge formats null as — and a genuine zero as $0.00.

## Verification

Use the package checks documented in ../docs/architecture.md. Record actual commands and results; distinguish mocked, seeded and real model evidence. Tests and UI captures must use the same checked-out implementation.
