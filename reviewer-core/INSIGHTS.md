# Reviewer-core engineering insights

## 2026-10-12 — Inference and grounding have separate boundaries

The review entry point receives an injected LLMProvider (`src/review/run.ts:52`)
and grounds merged findings against the supplied diff (`src/review/run.ts:197`).
The caller owns provider access, persistence and traces; a CLI adapter belongs
at the server's outer boundary, not in this pure engine. Verified by source
inspection; no independent reviewer-core test suite was run for this docs-only change.
