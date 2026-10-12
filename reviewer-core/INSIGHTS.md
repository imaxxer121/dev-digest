# Reviewer-core engineering insights

## 2026-10-12 — Inference and grounding have separate boundaries

The review entry point receives an injected LLMProvider (`src/review/run.ts:52`)
and grounds merged findings against the supplied diff (`src/review/run.ts:197`).
The caller owns provider access, persistence and traces; a CLI adapter belongs
at the server's outer boundary, not in this pure engine. Verified by source
inspection; no independent reviewer-core test suite was run for this docs-only change.

## 2026-10-12 — Preserve the actual prompt when evaluating Skills

The engine joins Skill bodies in input order (`src/prompt.ts:88`) and exposes
the same block in prompt assembly (`src/prompt.ts:131`). The server decides which
linked bodies are enabled; reviewer-core does not query the database. Real
comparison traces can therefore distinguish a missing attachment from an
ineffective directive. `npm test` passed 23 tests and `npm run typecheck` passed.
The API baseline already caught the rename, so that example does not prove a
quality gain (`../docs/l02-skills-report.md:40`).
