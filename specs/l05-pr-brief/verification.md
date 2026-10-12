# L05 PR Brief — plan verification

Verifier: the authorized `plan-verifier` subagent, inherited GPT-family Codex session. Date: 2026-10-12. Reviewed working implementation on `feat/l05-pr-brief` after artifact commit `612b9ee`. This report records implementation checks and their limits; it does not certify an unpublished submission.

**Outcome:** no unresolved implementation P1 was found. The saved evidence now supports two actual Codex generations, cached reload, focus navigation and the controlled SHA exercise. AC-09 remains a publication/demo P1 gate. A different-family review remains unavailable (AC-18, P2).

## Evidence independently checked

- Artifact gate: `git show --stat 612b9ee` contains only `spec.md`, `plan.md`, and `plan-review.md` (465 inserted lines), preceding feature code. All 25 EARS requirements and the adopted planning corrections were reviewed.
- **U:** `pnpm exec vitest run test/brief-input.test.ts test/brief-grounding.test.ts test/brief-contract.test.ts test/codex-brief.test.ts` in server: **10/10 passed**, four files. The adapter test mocks a process; it is not an actual Codex completion.
- **D:** `pnpm exec vitest run test/brief.it.test.ts test/context.it.test.ts test/pulls-detail.it.test.ts` in server: **23/23 passed**, three files, using real PostgreSQL transactions/locks and provider/GitHub fixtures. The selected Anthropic fixture is not an actual Claude call.
- **C:** `pnpm exec vitest run PrBrief ContextEditor focus.test core.test` in client: **26/26 passed**, five files. Includes eight URL-focus cases, four mounted diff-focus cases, cache/error states, head invalidation, and delayed mutation identity tests. These are DOM/hook tests, not a browser recording.
- Server and client `pnpm typecheck` passed independently. `git diff --check` reported no whitespace errors; line-ending warnings are informational.
- Root reports final full server **230/230 tests across 39 files** plus typecheck, final full client **103/103 across 26 files** plus typecheck, and a successful Next 15.5.19 production build. These full-suite/build results are the root/implementer's handoff, not reruns by this verifier.

### R — actual runtime evidence inspected

Read all eight JSON artifacts in `docs/evidence/l05/` and visually inspected root's eight `outputs/l05-*.png` screenshots. This verifier did not operate the browser or invoke a model.

- `first-generation.json` and `regenerated.json` identify provider `codex`, model `gpt-6.1-sol`, application calls/attempts **1/1** for call IDs `815d4fd7-1dd0-402a-8833-b81d57c3ef87` and `a42a3859-08e4-45eb-834c-dc114c05dbc9`. Each corresponding provider event artifact contains one started thread, one completed turn, one agent-message item and **zero tool/command items**. Usage is respectively **13,822/300** and **13,824/266** input/output tokens; cost remains **null**.
- Independently reconstructed each canonical messages/schema envelope from the prepared facts and current system/schema code: **12,314 UTF-8 bytes + 1,024 allowance = 13,338 <= 32,000**. This is an application input byte budget; it is not a provider token budget or a measurement of the provider's hidden framing. Changed-file input keys are only path/statistics/role/numeric anchors, with no patch/source body.
- The saved `specs/l04-blast-radius.md` attachment is **14,387 bytes**; both prepared-facts artifacts include **7,365 actual UTF-8 bytes** of its prefix with SHA-256 `29fe52449d321b40caf137206a591fb2702a488d92f7bd75fb06c473a50d6bb3`. The context screenshot and `browser-proof.json` record persistence after reload. Provenance and the rendered UI explicitly mark shortening, missing Intent and absent linked issue; the attachment is an acceptance plan, not a record of passed tests.
- `cache-sha-proof.json` records root's process-count sequence **17 baseline -> 18 first -> 18 reload -> 19 explicit Regenerate -> 19 SHA exercise/restore**, exact first-response equality after cached reload, preservation of the second brief while stale, and exact second-response equality after restore. Corresponding generated/cached/regenerated/stale screenshots agree with those saved summaries and states.
- `browser-proof.json` and inspected focus screenshots show `server/src/modules/_shared/context.ts:19` open in Files changed/Core, with a genuine focused RIGHT row at viewport coordinates **376.30–396.30** inside a 720px viewport, marker true. The caller-only `server/src/modules/pulls/routes.ts` target displays the indexed-snapshot/file-not-in-diff fallback.
- Freshness evidence uses root's **local controlled fixture**, not a remote commit: `PullsRepository.syncMeta` moves head to `controlled-l05-next-head`, old detail facts are cleared and the prior brief remains stale. Root restores real head `674794b9af6a7592251755c134441ee589a72134` and its detail through `saveDetail`; no additional generation is recorded.

PASS below is supported by inspected implementation and deterministic checks, supplemented by R where applicable. Provider output describes potential exposure rather than proving code correctness; publication remains pending.

## EARS results

| ID | Priority | Status | Concrete evidence |
| --- | --- | --- | --- |
| AC-01 | P1 | PASS | `PrBrief.tsx:51` and Overview show the labeled region and Generate without valid cache; C absent/loading/error cases. |
| AC-02 | P1 | PASS | Strict output schema and `PrBrief.tsx:66` render summary, titled risks and ordered focus; U/D/C and R actual generated/regenerated JSON and UI. |
| AC-03 | P1 | PASS | Saved Intent and one adjacent Blast block; provenance exposes missing/degraded inputs. D missing/partial cases, C coverage and R explicit missing Intent plus actual Blast (2 symbols/8 callers/27 potential endpoints). |
| AC-04 | P1 | PASS | Strict risk/focus schema requires title/references and positive line/reason; exact allowset grounding precedes save. U and D mixed-reference cases. |
| AC-05 | P1 | PASS | `brief/grounding.ts` filters exact captured changed/caller paths, drops empty risks/unknown focus, deduplicates without replacement. U includes invented/traversal/spec/endpoint references. |
| AC-06 | P1 | PASS | PR page's `focusFile` changes tab/file/line together; generic target expands role and file. C grouped/original/collapsed cases; R actual Core/file navigation. |
| AC-07 | P1 | PASS | Scoped GET only reads cache/head, with zero external calls/writes; D/C. R cached UI reload and recorded exact response equality, process count unchanged at 18. |
| AC-08 | P1 | PASS | Explicit POST replaces successful cache once; retry false and mutation identity captured. D/C. R new call ID/summary only after explicit Regenerate, count 18 -> 19. |
| AC-09 | P1 | UNRESOLVED | Spec/plan exist and are committed. Published implementation PR description and playable 1–3 minute journey have not yet been provided to this verifier. |
| AC-10 | P2 required | PASS | `brief/service.ts:54` makes one structured call, maxRetries zero, rejects extra attempts. D and R two distinct calls, each one process/attempt with actual provider/model metadata and zero tools. |
| AC-11 | P2 required | PASS | Exact serialized messages/schema plus labeled 1,024-byte allowance <=32,000; U adversarial/overflow cases. R independently recomputed 12,314 + 1,024 = 13,338 for both real calls. |
| AC-12 | P2 required | PASS | Input is a field whitelist; patch is used only to extract numeric hunk anchors. U/D sentinel and oversized input tests exclude raw patch/diff/source bodies. Saved specification prose is an explicitly allowed input. |
| AC-13 | P2 | PASS | Vendored contracts match and strict generated/cache contracts validate summary/focus. U byte-identity and malformed/legacy cache tests; both typechecks. |
| AC-14 | P2 required | PASS | Settings `risk_brief` resolves selected provider/model (D); U isolated adapter. R actual subscription Codex `gpt-6.1-sol` on both generations. No actual Claude call is claimed. |
| AC-15 | P2 required | PASS | Scoped capture/upsert locks and head-race 409 preserve cache; all head writers keep facts coherent. D real-lock/race/list/poll/stats cases, C invalidation, R controlled local head move/restore with stale prior brief and no inference. |
| AC-16 | P2 | PASS | `FileCard.tsx:47` matches mounted RIGHT row by `newNo`, expands then scrolls/focuses. C exact/header cases; R genuine RIGHT 19 within viewport, marker true. |
| AC-17 | P2 | PASS | Artifact-only commit `612b9ee` precedes feature implementation; this report maps every EARS criterion before publication, with pending gates openly identified. |
| AC-18 | P2 | UNRESOLVED | Independent plan review used the inherited GPT-family session. Claude Code and a different-family API are unavailable. `plan-review.md` records that limitation; no cross-model review/comparison is claimed. |
| AC-19 | Required | PASS | Brief/context/detail SQL scope both row workspace and parent repo. D foreign and mismatched-parent requests return 404 with zero provider/GitHub calls or mutations. |
| AC-20 | Required | PASS | D/U/C prove persistence/isolation/budget. R saved 14,387-byte spec survives reload and 7,365-byte content prefix with path/digest appears in both actual prepared inputs, disclosed as shortened. |
| AC-21 | Required | PASS | Explicit missing/unavailable/truncated provenance; standalone local issue parser (U/D). C/R show missing Intent/unlinked issue and spec shortening without fabricated facts or a compensating completion. |
| AC-22 | Required | PASS | Loading Button disables action; application-lifetime same-PR guard releases in finally. Provider/schema/DB/head errors preserve last success; mutation retry false. D competing POST and rollback cases, C pending/error/cache cases. |
| AC-23 | P3 | PASS | C missing-file/header cases; R actual caller-only target shows file-not-in-diff and indexed-snapshot explanation without a fabricated row. |
| AC-24 | P3 | PASS | Added brief/context copy uses message keys with skeleton, pending, loading/error and empty states. C covers these states; typechecks pass. |
| AC-25 | P3 | PASS | Risk explanations reuse generated cached facts; no additional inference. Optional latest verdict/score, history and retrospective were explicitly deferred and are not claimed. |

## Corrected findings rechecked

`pulls/repository.ts:11` locks the PR row while reading offline metadata/files/commits, preventing a mixed snapshot. Its PostgreSQL regression blocks behind a real competing row lock and verifies the committed coherent head and children. `saveStats:23` compares both captured and returned SHA to the locked durable SHA; delayed stats cannot resurrect obsolete counts. `brief/input.ts:10` accepts only standalone local issue references; its regression rejects external `owner/repo#N` and URL-fragment references.

Client navigation preserves unrelated query parameters; line parsing rejects nonpositive, noninteger and unsafe values. Brief/context mutations store results under the identity captured in `onMutate`, rather than the route reached while a request is pending. Head advances invalidate detail, brief, Smart Diff and Blast cache without POST. Existing success remains visible on load/generation errors, and stale state also compares the displayed PR head.

## Remaining handoff

The supplied runtime handoff is inspected and recorded above. Root still owns the playable 1–3 minute video, published implementation PR/description and GoIT submission. AC-09 stays unresolved until concrete publication/demo proof arrives, and must be resolved before claiming submission complete. AC-18 remains an honest P2 process limitation.

Existing index replacement is not an atomic versioned symbol snapshot; Blast's indexed SHA/degradation stay disclosed. The same-PR guard covers the current single server, not multiple server instances. These inherited/documented limits do not introduce a new P1 mismatch in the specified scope.
