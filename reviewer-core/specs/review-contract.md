# reviewer-core review contract

A review returns structured verdict, score, grounded findings, token counts and nullable costUsd. Grounding must reject citations outside actual diff hunks. Optional skill bodies are prompt input, not trusted executable instructions. Unit tests may mock inference; describe those as mocks.

## Verification

Use the package checks documented in ../docs/architecture.md. Record actual commands and results; distinguish mocked, seeded and real model evidence. Tests and UI captures must use the same checked-out implementation.
