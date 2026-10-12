# E2E engineering insights

## 2026-10-12 — The bundled e2e lane is a separate browser runner

`run.ts:4` uses agent-browser CDP commands; `run.ts:16` explicitly targets seeded
read-only data without model calls. Our Windows CUA browser checks confirmed
severity selection/reset/empty results and the PR-list preview. Those checks are
not a claim that the separate Unix hermetic runner passed. Keep seed/UI evidence
separate from real inference evidence.
