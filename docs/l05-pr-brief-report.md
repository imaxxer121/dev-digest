# L05 — PR Why + Risk Brief

PR Overview now gives a reviewer a short summary, grounded risk areas and an
ordered file:line review starting point. Generate and Regenerate explicitly
request one structured model completion; opening/reloading Overview reads the
saved JSON. Intent and Blast Radius appear beside the brief with honest missing
or coverage states. The Project Context editor saves real text specs for the
next generation.

## Process and artifact gate

Actual authorized agents executed spec-creator → implementation-planner →
run-plan → plan-verifier. Spec creator authored `specs/l05-pr-brief/spec.md`;
implementation planner authored `plan.md`; architecture reviewer reviewed the
plan and recorded adopted corrections in `plan-review.md`. Commit **612b9ee**
contains those three artifacts before any implementation. Run-plan implemented
the client; the primary implemented server/persistence/provider integration;
server-tests authored PostgreSQL scenarios; architecture-reviewer and
plan-verifier inspected the result. `verification.md` maps all 25 EARS criteria.

Agents used the inherited GPT-family session. A review by a different model
family was unavailable; **P2 AC-18 is not claimed as complete**. No Claude Code
run or unavailable API key is claimed. The working inference uses the existing
Codex CLI subscription login through the selected risk_brief settings.

## Implementation

- Workspace and parent-repository scoped GET/POST `/pulls/:id/brief` reuse
  `pr_brief` JSON and include captured head/version/provenance/generation metrics.
  GET never invokes a model, parser, indexer or GitHub adapter.
- Explicit POST captures coherent persisted PR/files/Intent/specs, reads the
  existing impact map, optionally resolves a standalone same-repo issue, and
  makes one `completeStructured` call with `maxRetries:0`. No full diff hunks
  are sent. Numeric candidate hunk-start lines are extracted locally.
- The 32000-byte application envelope budget includes serialized messages and
  schema plus 1024 bytes of framing allowance. Deterministic section limits and
  reduction retain spec prefixes with digest/original/included bytes. This is
  not a guarantee about provider hidden prompts or token counts.
- Strict schema validation and an exact allowset from all captured changed
  paths plus cached caller paths remove invented references/focus. Dropped
  references, risks and focus are counted without a replacement model call.
- Row locks coordinate fact capture/final save with live detail/list/poll head
  writers. Head movement during inference returns 409 and preserves the old
  brief. Late detail/stats cannot overwrite a newer head's facts. A moved head
  leaves an old saved brief readable with an explicit stale warning.
- Context GET/PUT store nonblank bounded text specs under a validated logical
  path, deduplicate scoped legacy rows and preserve code/docs. This is a text
  attachment editor; it does not claim to watch a filesystem folder.
- Review focus preserves URL parameters, opens the target group/file and scrolls
  to the actual RIGHT row. Missing lines use a header notice. Caller files
  absent from this diff show an indexed-snapshot limitation. Mutation results
  retain their originating PR/repo cache identity during navigation.

## Actual run and browser evidence

The demonstration uses public PR10 in imaxxer121/dev-digest with the real diff
and cached index at **674794b9af6a7592251755c134441ee589a72134**. It changes
`server/src/modules/_shared/context.ts`; the map has 2 symbols, 8 callers and 27
potential HTTP endpoints. Its saved Intent and linked issue are absent and the
UI says so. The attached `specs/l04-blast-radius.md` is an actual 14387-byte
acceptance plan, not validation evidence. Its digest is
`29fe52449d321b40caf137206a591fb2702a488d92f7bd75fb06c473a50d6bb3`;
7365 bytes fit in this input.

| Actual action | Observation |
| --- | --- |
| Generate | call 815d4fd7-1dd0-402a-8833-b81d57c3ef87;14041 ms;13822 input/300 output tokens |
| Reload | Same JSON and call ID; process count stays18 after baseline 17 |
| Regenerate | calla42a3859-08e4-45eb-834c-dc114c05dbc9;9957 ms;13824 input/266 output tokens; count 19 |
| Focus click | Files changed opened context.ts RIGHT19, visible at y376–396 in720 px viewport |
| Caller-only click | pulls/routes.ts:27 produced the explicit “File not in this PR’s diff” notice |
| Saved Context reload | Real saved path/content remained14387 bytes |
| Controlled local SHA move | `PullsRepository.syncMeta` moved only the own demo PR to `controlled-l05-next-head`; saved brief remained readable/stale; no model call |
| Restore | `saveDetail` restored real published head, original diff/body/stats; response equals regenerated JSON; count 19 |

Both provider event streams contain exactly one final agent message, zero tool
items, one attempt and actual usage. Canonical envelope remeasurement equals
**12314+1024=13338 ≤32000 UTF-8 bytes** for both. The provider's larger input
token counts are separate usage metrics; dollar cost is unknown, not zero.
Prepared facts contain no patch/code/hunk fields or raw diff hunk marker.
Model prose describes potential exposure and does not claim a verified defect.

`docs/evidence/l05/` contains first/regenerated results, actual prepared facts
and provider events, cache/SHA/browser proof and checks. No credentials or
private configuration are included. The controlled SHA scenario is simulated
local state and is not presented as an actual remote commit.

## Validation and limitations

- Server `pnpm typecheck`; full `pnpm test`: **230/230 in 39 files**, real
  PostgreSQL integration included, after final race/scoping fixes.
- Client `pnpm typecheck`; equivalent configured runner
  `node node_modules/vitest/vitest.mjs run`: **103/103 in 26 files**.
- Client `pnpm build`: passed Next 15.5.19 production compilation/typechecks.
- Plan-verifier independently passed 10 focused server unit tests, 23 real-PG
  integration tests and 26 focused client tests, plus both typechecks.
- Contract copies are identical; whitespace verification passed.

Existing repo-intel reindex writes are not an atomic versioned snapshot; Brief
records indexed SHA/coverage without extending that inherited guarantee.
Legacy Intent has no SHA freshness metadata. A different-family planning
review remains the disclosed optional P2 gap. P3 graph/prior-history additions
are outside this homework scope. Publication/demo status is recorded by the
final verifier report and PR attachment.
