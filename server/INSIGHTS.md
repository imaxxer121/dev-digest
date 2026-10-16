# Server engineering insights

## 2026-10-16 — Intent revisions and Context snapshots have different boundaries

Intent capture selects only title, nullable body and file path/count metadata
(`src/modules/reviews/repository/pull.repo.ts:58`). Saving locks the PR and checks
both its captured head and saved generation identity (`:80`), so late or competing
results cannot replace a newer success. Batch preparation receives the queued
head and runs once before agent fan-out (`src/modules/reviews/run-executor.ts:118`);
classifier usage stays separate from individual review totals. Nullable legacy
provenance remains unknown. Eight isolated PostgreSQL Intent tests passed with
zero skips; the retained live classifier record reports 11,722 input and 149
output tokens, with unchanged cached reload, in
`../docs/evidence/course-labs-completion/intent-live-before-reload.json`.

Filesystem Context rechecks persisted agent/Skill links, reads fresh once per
selected document and freezes each agent's snapshot
(`src/modules/project-context/service.ts:38`). Budget the actual guarded block,
skipping whole documents in saved order (`:60`), and measure the block returned
by core for the saved trace (`src/modules/reviews/run-executor.ts:308`). This
8,000-token estimate is distinct from provider usage and Brief's 32,000-byte
envelope. `test/course-labs-runtime.it.test.ts` passed 4/4 in the saved root
PostgreSQL log; these fixtures do not establish live Context/model quality.

## 2026-10-13 — Multi-agent membership and outcome commit boundaries

Group creation saves the immutable selected run IDs/names and all children in one
transaction, rechecking enabled workspace agents under shared row locks
(`src/modules/reviews/repository/multi-agent.repo.ts:30`). Execution prepares one
diff and one set of cached enrichments, then starts isolated cloned contexts with
`Promise.allSettled` (`src/modules/reviews/run-executor.ts:104`). Deferred injected
providers prove all three calls enter before any resolves; this is a concurrency
test, not a claim about model quality or provider latency.

Outcome persistence locks the child and atomically commits review, original
findings, exact trace and done status
(`src/modules/reviews/repository/multi-agent.repo.ts:14`). Cancellation uses the
same row's compare-and-set; a late model response cannot leave a cancelled review
or overwrite its status. Failure updates preserve terminal results. Preserve the
immutable membership when agent deletion nulls its live FK; absence/deletion of
the child itself is unknown, never a completed negative.

Verified: direct package `node node_modules/typescript/bin/tsc --noEmit -p
tsconfig.json` passed; `node node_modules/vitest/vitest.mjs run --exclude
'**/*.it.test.ts'` passed 218 tests. The required isolated Testcontainers suite
`node node_modules/vitest/vitest.mjs run test/multi-agent.it.test.ts` passed all
13 tests with zero skips, including post-inference cancellation, shared-prep
failure, agent deletion, trace rollback, foreign/malformed parent scoping and
simultaneous idempotent Learn. Migration 0015 includes the generated snapshot.
No application database or real model was used by these checks.

The legacy reviews integration suite shared enabled agents across cases: five
created fixtures plus the three seeded presets made its final `all:true` request
return 422 `invalid_run_selection`. Reset only that suite's workspace agents
before each case (`test/reviews.it.test.ts:109`) and inject a deterministic
OpenRouter provider for the seeded presets (`test/reviews.it.test.ts:121`). The
existing run-all case now verifies exact enabled membership and completed saved
reviews, then proves both all and explicit six-agent requests queue no rows
(`test/reviews.it.test.ts:308`). The production 1–5 bound remains unchanged.
Final direct server typecheck passed; `node node_modules/vitest/vitest.mjs run
.it.test` passed all 114 PostgreSQL tests in 14 files with zero skips (50.67s).

## 2026-10-13 — Eval snapshots retain raw noise and survive source changes

Historical eval conversion recovers only the supported final saved diff wrapper
(`src/modules/evals/source.ts:16`); escaped delimiters, mismatched hunk counts,
deleted-only citations and oversized UTF-8 files are unsupported. Exact future
raw diff/model-visible PR metadata is saved at `src/modules/reviews/run-executor.ts:263`.
The source head remains null because a queued PR row cannot certify which
revision a later stored-file/GitHub fallback returned. A targeted actual-loader
test with queued H0 and injected GitHub H1 proves this conservative provenance
(`test/evals-trace-provenance.test.ts:14`, 1/1 passed); no actual model is used.
Unknown historical title/head remain null. Shared prompt assembly omits blank
descriptions, so `src/modules/evals/digest.ts:12` normalizes them to one input
digest; otherwise identical prompts would receive separate calls/denominators.

Conversion locks the source finding, checks every workspace-bearing relationship
and validates saved identity even on an idempotent return
(`src/modules/evals/repository.ts:34`, `src/modules/evals/repository.ts:79`).
Source finding/review IDs are provenance scalars; frozen cases remain readable
after their source review is deleted. Batch creation explicitly uses REPEATABLE
READ at `src/modules/evals/repository.ts:144`, and a partial unique running index
prevents a same-agent race (`src/db/schema/eval.ts:36`). Snapshots retain configured
strategy/schema while effective execution uses Review/single-pass/retries=0.

The pure scorer performs maximum one-to-one positional matching and keeps every
raw candidate in precision, including duplicates and rejected citations
(`src/modules/evals/scorer.ts:13`). Aggregation sums unique-group integer counts
before division; zero denominators, partial overall ratios and unknown cost stay
null (`src/modules/evals/scorer.ts:41`). Startup interruption is awaited before
requests (`src/app.ts:74`); even an orphan with every group already completed
stays failed with null aggregate ratios (`src/modules/evals/snapshot.ts:77`).

Fastify passes null to validation for an absent body. An optional object schema
alone therefore rejects a true empty POST, unlike `{}`. The route preValidation
hook normalizes only an absent request body to `{}`
(`src/modules/evals/routes.ts:11`); explicit JSON null/arrays/primitives/unknown
fields remain 422. Real no-payload/no-content-type conversion and Run all tests
cover the browser action shape; the earlier 31-case suite only used `{}`.

App construction performs startup recovery, so a "no DB" smoke test cannot
rely on lazy postgres-js connection. `loadConfig` imports dotenv; inheriting its
database URL let the old smoke tests run recovery against the local application
database. Tests now must inject an isolated DB before client creation
(`src/app.ts:45`), and `test/routes-smoke.test.ts:13` forbids real client creation
while injecting a fake startup DB. This preserves production and PostgreSQL
integration recovery. The isolated smoke suite (5 tests) and required eval
PostgreSQL suite (38 tests) passed together, 43/43 with zero skips; server
typecheck passed. No scorer, gold dataset or model inputs changed for this fix.

Verified: native `pnpm typecheck` passed; `node node_modules/vitest/vitest.mjs run
--exclude '**/*.it.test.ts'` passed 201 tests in 28 files. Focused final
`node node_modules/vitest/vitest.mjs run test/evals.it.test.ts test/evals-pure.test.ts`
passed 31 real PostgreSQL/Testcontainers tests and 34 pure tests, with zero skips.
The required DB suite fails if Docker is unavailable. Providers are injected and
live source I/O is forbidden in these tests; these results make no claim about
actual model quality or the separate root-owned experiment. After the empty-body
fix, `node node_modules/vitest/vitest.mjs run test/evals.it.test.ts` passed all
38 PostgreSQL tests with zero skips and server `pnpm typecheck` passed again.
Final root `pnpm verify:l06` after the isolation guard passed 203 server unit
tests in 29 files, 38 mandatory real PostgreSQL tests, 119 client tests and
23 reviewer-core tests, plus all three typechecks and mirrored contract parity.
The actual three-prompt experiment is recorded separately in
`../docs/evidence/l06/experiments.json`; it does not replace deterministic tests.

## 2026-10-12 — PR Brief captures coherent facts and generates explicitly

`src/modules/brief/service.ts:36` captures PR head/files/specs before inference;
one `completeStructured` at line 54 uses `maxRetries: 0`, then exact-path
grounding and a row-locked head comparison protect the JSON cache. GET reads
the cache only. The same PR lock coordinates list/poll sync, live detail,
offline reads and delayed stats (`src/modules/pulls/repository.ts:11`).
Without the captured/fetched/current SHA guard at line 23, late stats can belong
to an older revision. PostgreSQL tests exercise real lock contention and races.

Specs use scoped `code_chunks.source=spec` replacement with an advisory lock
(`src/modules/context/repository.ts:19`); ordinary code/docs remain intact.
Do not infer Intent freshness: its legacy table has no SHA. Standalone issue
references are parsed locally (`src/modules/brief/input.ts:10`); qualified
foreign-repository references and URL fragments are not same-repo issues.

The measured budget at `src/modules/brief/input.ts:142` is UTF-8 bytes of the
serialized application messages/schema plus 1024 framing allowance, not provider
hidden prompt tokens. Two real Codex calls measured 12314+1024=13338 bytes;
actual input usage was 13822 and 13824 tokens, recorded separately. Both had one
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

## 2026-10-13 — CI artifacts require the executed workflow and repository identity

Checking only a base workflow lets a PR replace the workflow that produces its
artifact. Authenticated retrieval checks the actual head workflow, then hashes
the trusted base runner, manifest, Skills and memory (`src/adapters/github/ci-artifacts.ts:44`,
`src/modules/ci/provenance.ts:17`). Artifact redirects use a fresh request without
the GitHub bearer token (`src/adapters/github/ci-artifacts.ts:31`). Exported memory
must fit the runner budget before ZIP creation (`src/modules/ci/service.ts:36`).

Duplicate installation exports must share the workspace/numeric repository/run/
attempt identity. Transaction advisory locking plus a unique index prevent a
concurrent first import from duplicating its run, review and original findings
(`src/modules/ci/repository.ts:23`, `test/ci.it.test.ts:85`). The focused command
`node node_modules/vitest/vitest.mjs run test/ci-pure.test.ts test/ci-adapter.test.ts
test/ci.it.test.ts` passed 36 tests, including 8 mandatory isolated PostgreSQL
cases. The server unit suite passed 231 tests and TypeScript checking passed.
These provider/HTTP fixtures verify provenance and persistence, not model quality.

An installation PR introduces its workflow before trusted base contains the
runner. The generated guard verifies all three runtime files and the selected
UUID manifest, skips inference/artifact with an explicit first-install notice,
and fails an already-installed but damaged base (`src/modules/ci/workflow.ts:33`,
`test/ci-bootstrap.test.ts:43`). Tests execute the actual generated Bash against
absent, partial, complete and PR-only fixture files, rather than assuming a
missing runner means a successful review. After the multi-agent merge, the full
server suite passed 368 tests in 47 files; the subsequent bootstrap follow-up
passed 44 focused CI tests, including 8 bootstrap and 8 PostgreSQL cases.

Generate a concurrent feature's snapshot from the merged previous snapshot.
The 0016 snapshot points to 0015 and preserves all 39 non-CI table definitions.
Custom backfill SQL must use the same explicit FK names as the generated
snapshot (`src/db/migrations/0016_l07_ci.sql:1`); unnamed inline REFERENCES would
otherwise produce a different PostgreSQL name and cause later migration drift.
