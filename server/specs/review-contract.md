# server review contract

A successful review stores outcome.costUsd in agent_runs.cost_usd and its trace Stats. PR-list cost totals every done run, not a guessed time batch. Null in any successful run means the total is unknown. Latest findings previews use persisted review/findings rows and never trigger inference.

## Verification

Use the package checks documented in ../docs/architecture.md. Record actual commands and results; distinguish mocked, seeded and real model evidence. Tests and UI captures must use the same checked-out implementation.
