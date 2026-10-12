# Server engineering insights

## 2026-10-12 — PR Brief captures coherent facts and generates explicitly

`src/modules/brief/service.ts:36` captures PR head/files/specs before inference;
one `completeStructured` at line54 uses `maxRetries: 0`, then exact-path
grounding and a row-locked head comparison protect the JSON cache. GET reads
the cache only. The same PR lock coordinates list/poll sync, live detail,
offline reads and delayed stats (`src/modules/pulls/repository.ts:11`).
Without the captured/fetched/current SHA guard at line23, late stats can belong
to an older revision. PostgreSQL tests exercise real lock contention and races.

Specs use scoped `code_chunks.source=spec` replacement with an advisory lock
(`src/modules/context/repository.ts:19`); ordinary code/docs remain intact.
Do not infer Intent freshness: its legacy table has no SHA. Standalone issue
references are parsed locally (`src/modules/brief/input.ts:10`); qualified
foreign-repository references and URL fragments are not same-repo issues.

The measured budget at `src/modules/brief/input.ts:142` is UTF-8 bytes of the
serialized application messages/schema plus 1024 framing allowance, not provider
hidden prompt tokens. Two real Codex calls measured 12314+1024=13338 bytes;
actual input usage was 13822 and13824 tokens, recorded separately. Both had one
structured attempt and zero tool items. Reload and controlled head move/restore
added no model process. Evidence is in `../docs/evidence/l05/`.

Final server typecheck passed; `pnpm test` passed 230 tests across 39 files,
including real PostgreSQL integration. Provider/GitHub fixture tests and the
two actual CLI generations are distinguished in the report. Different-family
planning review remains unavailable, an explicitly reported optional P2 gap.

## 2026-10-12 — CLI entry-point checks must convert Windows paths

Comparing `import.meta.url` with a string built as `file://${process.argv[1]}`
silently skipped migration and seed execution on Windows. Compare it with
`pathToFileURL(resolve(process.argv[1])).href`, guarded for a missing argument.
Evidence: `src/db/migrate.ts:37` and `src/db/seed.ts:229`. After the fix, migration
and seed completed and the local seeded PR appeared in the browser.

Test fixture parents also need `dirname(full)` rather than slash-only splitting
(`test/indexer-pipeline.test.ts:142`). The server unit suite passed 101 tests
with `node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'`;
TypeScript checking passed. DB integration tests were not run.

## 2026-10-12 — Successful-run cost totals require unknown-price propagation

The official lab's 120-second cost window omitted older successful runs. The
homework total must cover all done runs; if one price is null the total remains
unknown instead of a partial sum. Evidence: `src/modules/pulls/cost.ts:3` and
`src/modules/pulls/routes.ts:181`. `test/run-cost.test.ts:5` covers grouping, true
zero, null propagation and no runs. Server typechecking and 103 unit tests passed;
migration 0010 was applied to the separate local fixture database. Preview reads
use only the latest review's persisted findings, independent of cost history.

## 2026-10-12 — Persist versions and knowledge decisions atomically

Skill creation and its initial snapshot share a transaction; body edits lock the
Skill row before assigning the next version (`src/modules/skills/repository.ts:76`
and `src/modules/skills/repository.ts:112`). Concurrent edits now preserve both
bodies and a matching current snapshot. Approved and rejected conventions survive
re-scan (`src/modules/conventions/repository.ts:21`); exact source snippets are
validated and their line is computed from loaded text
(`src/modules/conventions/helpers.ts:4`). Agent Skill links reject foreign workspace
IDs before replacement (`src/modules/agents/service.ts:158`).
`pnpm typecheck` passed and `pnpm test` passed 140 tests, including 6 L02
PostgreSQL integration cases. Model evidence is independent of these test results.
The actual traces show saved Skill order and exclusion of a disabled body
(`src/modules/reviews/run-executor.ts:188`, `../docs/evidence/l02/skills-composition.json:1`).

## 2026-10-12 — Persisted Smart Diff reads need aligned latest-review feeds

Path classification requires no inference: ordered pure rules produce five
groups before any review (`src/modules/reviews/smart-diff/constants.ts:3`).
The read service checks PR workspace ownership before querying stored files
and the latest kind=review (`src/modules/reviews/service.ts:177`). Excluding
summaries and using a createdAt/id tie break keeps empty latest reviews from
reviving older markers (`src/modules/reviews/repository/review.repo.ts:78`).

The full reviews feed must use the same workspace predicate as Smart Diff;
the schema permits malformed reviews whose workspace differs from their PR.
Evidence: `src/modules/reviews/repository/review.repo.ts:66` and
`test/smart-diff.it.test.ts:99`. The integration test verifies both endpoints
exclude the foreign review. `pnpm typecheck` and final `pnpm test` passed
185 tests in 28 files, including all PostgreSQL cases. These tests use provider
spies; the separate actual run is documented in
`../docs/evidence/l03/real-review.json`.

## 2026-10-12 — Cached impact reads need declaration identity and POSIX paths

Blast Radius reads only persisted index rows (`src/modules/repo-intel/service.ts:211`)
and groups callers by declaration file plus symbol name, so duplicate names do
not cross-contaminate groups. Enclosing names require both range endpoints
(`src/modules/repo-intel/service.ts:635`); otherwise top-level references can be
misnamed as a previous function. The PR and its parent repository are both
workspace-checked before reading the facade (`src/modules/blast/service.ts:9`).

Dependency-cruiser paths must normalize Windows separators before matching the
POSIX index (`src/adapters/depgraph/index.ts:111`). A real full index initially
had zero callers until this was fixed; reindexing the same fixture found eight.
`test/depgraph-paths.test.ts:8` exercises the real adapter, including TS ESM
`.js` imports. Final `pnpm typecheck` passed and `pnpm test` passed **197/197**
in 32 files, including PostgreSQL integration. Cache tests forbid parser, Git
and provider I/O. Three actual HTTP reads left run/index records unchanged;
the actual stdio MCP and Codex call records are in `../docs/evidence/l04/`.

Cached reverse file imports extend potential endpoint/cron impact by one hop
after a direct symbol caller (`src/modules/repo-intel/service.ts:666`). This is
not a second-hop symbol call graph or proof of runtime invocation. Existing
index writes are not atomic; snapshot guarantees during concurrent reindexing
require a future versioned/transactional index change.
