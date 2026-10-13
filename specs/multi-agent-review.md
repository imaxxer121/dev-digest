# Multi-Agent Review

Status: planned before implementation, 2026-10-13.
Base: L06, with the course agent-runner imported separately.

## User stories and acceptance

1. From a PR, configure an explicit selection of 1–5 enabled workspace agents.
   Show measured historical duration/cost estimates, with unknown values kept unknown.
   The request rejects empty, duplicate, disabled, foreign and excessive selections.
2. Persist a parent multi_agent_runs record and immutable selected child run IDs
   atomically. Load the diff once and start selected reviews concurrently. Isolate
   each context, status, trace and cancellation. A failed agent cannot hide successful
   peers or be reported as having found no issues. Reload restores the same group.
3. Compare Columns and Tabs + detail, with live per-agent status/log and View trace.
   Group findings by file, overlapping range and a documented semantic heuristic;
   retain each original finding and agent attribution. Different ranges/issues stay
   separate. Show per-agent conclusions at each grouped location and filter conflicts.
   Only a completed successful review can mean “did not flag”. Expose uncertainty
   for failed, cancelled and unfinished agents, and severity disagreement separately.
4. Reuse persisted Accept/Dismiss, confidence, suggestion, Learn and eval conversion
   actions. Do not implement dummy action buttons. Workspace checks protect group,
   child run, trace, SSE and mutation reads/writes.
5. Deterministic tests verify real concurrency using deferred providers, shared
   preparation once, partial failure, workspace isolation, grouping and UI recovery.
   Real model evidence separately compares one versus three agents on unchanged PR
   input and records observed tokens, cost availability and wall-clock duration.

## Ownership and shared interfaces

Worktree A: feat/l07-multi-agent-review. Owns server/src/modules/reviews,
server/src/db/schema/runs.ts, its additive migration, multi-agent DTOs mirrored in
server/client, client PR detail components/hooks/messages under multi-agent scope.
No changes to agent-runner or server/src/modules/ci. Add group ID as an optional
backward-compatible response/run field. Existing FindingRecord remains canonical;
groups reference originals rather than replacing them. A owns review-api.ts.

Worktree B owns eval-ci.ts, CI tables/migration, Agent CI tab and CI navigation.
Root coordinates container/app/barrel/navigation integration and migration ordering.
Use separate worktree package installs; no root workspace or root install. Do not
start worktree apps against the existing live studio database. Integration tests
must inject isolated PostgreSQL/Testcontainers databases and never live models.

## Verification and merge order

Server pnpm typecheck and relevant Vitest unit/PostgreSQL tests; client pnpm
typecheck and interaction tests; mirrored DTO parity. A merges before B. Then B
updates its base and runs its checks against A's final contracts. Root runs the full
existing verification plus L07 suites, production build and browser/model demo.
