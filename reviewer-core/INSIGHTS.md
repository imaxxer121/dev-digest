# Reviewer-core engineering insights

## 2026-10-16 — Optional Intent uses the same guarded assembly in both strategies

The caller supplies resolved Intent; core reconstructs its three purpose/scope
fields and wraps them as untrusted data (`src/prompt.ts:108`). With no Intent,
the new assembly slot is omitted, preserving the prior prompt shape. Both
single-pass and every map-reduce chunk receive the same prompt parts
(`src/review/run.ts:138`); the shared grounding gate still runs after reduction
(`:201`). The unconditional system guard forbids purpose or scope from waiving
a real vulnerability/correctness finding (`src/prompt.ts:28`). Keep provider
selection, classification, files and persistence outside this pure engine.

`node node_modules/vitest/vitest.mjs run` passed 26/26, including both strategy
captures, delimiter escaping and retained grounding; core typechecking passed.
These injected-provider fixtures prove mechanics, not model compliance. Attached
Context also uses the existing specs wrapper, so its caller must measure that
assembled block rather than summing raw document estimates.

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
