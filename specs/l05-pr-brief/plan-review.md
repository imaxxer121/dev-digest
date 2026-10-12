# L05 — Independent plan review

Stage: architecture-reviewer acting as the independent plan reviewer, before
run-plan implementation. Date: 2026-10-12. Reviewed baseline: L04 `e7653ab`.

Model identity: GPT family, the current inherited Codex session. No model
override or other-family model was started. This is an independent same-model
agent review, not a Claude review or a different-family comparison. Claude Code
and a Claude/model API key are unavailable in this session. The different-family
review remains unperformed and must remain explicit in the verification report.

## Review outcome

Approved for implementation after the artifact commit. The final saved plan
and the authorized specification addendum contain the corrections below;
no planning blocker remains. This approval covers the design and verification
plan, and does not certify implementation or test success.

## Findings and agreed corrections

| ID | Priority | Finding | Required correction and review status |
| --- | --- | --- | --- |
| PR-01 | Required / P2 | The first draft describes an immutable PR capture without specifying how PR metadata and files stay coherent while a live detail refresh replaces them. Separate reads can pair an old head with new files. | Resolved in the saved plan, server steps 2, 3 and 5: capture holds the same PR row lock as detail/head writers; the final head check and cache upsert share a locked transaction. Verified on document re-read before implementation. |
| PR-02 | Required / P2 | Fixing live detail refresh alone does not cover metadata-only head writers. Baseline `server/src/modules/pulls/routes.ts:71` and `server/src/modules/polling/routes.ts:53` advance head SHA while retaining prior-head files/body. A later locked capture could save a fresh-looking brief grounded against obsolete paths. | Resolved in saved server step 2, the detail integration test row and the spec addendum. Shared scoped list/poll metadata sync clears files, commits, body and stats atomically on head advance; same-head updates retain them. Generation uses remaining facts with missing-input provenance, no old changed paths and Blast called with captured empty paths; detail refresh restores coherent facts. The regression must verify head advance before generation and old-cache staleness. |
| PR-03 | Required / P2 | The first draft says no provider-adapter change is planned, while the actual generation evidence needs a controlled Codex invocation without inherited configured tools. A prompt instruction alone does not establish tool isolation. | Resolved in ownership scope, server step 6, adapter tests and the spec addendum: narrow per-run config isolation, shell-tool disablement and disabled web search, with ignored scratch prompt/events evidence. No user settings change or extra inference is planned. Actual zero-tool evidence remains implementation-stage work. |
| PR-04 | P3 | The first draft points to the e2e contract after declaring the root contract missing, but package-local contracts exist, including `server/specs/review-contract.md` and the client counterpart. | Resolved in the saved plan's guide paragraph, which now names affected package-local contracts. |

The PR-02 policy was reviewed and accepted as the minimal design without a new
column or migration. Missing facts must not be presented as a clean PR: empty
grounded risks/focus retain the missing-input notice. It is valid to generate
from remaining available facts, but old paths must never enter the allowlist.

## Areas reviewed without further blocking findings

- Root owns both vendored DTO copies and hands final exported contracts to the
  client before parallel implementation. Routes validate context; services use
  container ports; scoped repositories own SQL and transactional writes.
- GET only validates/reads durable cache and head. Explicit POST alone resolves
  `risk_brief`, captures facts and calls `completeStructured` once with
  `maxRetries: 0`; attempts other than one are rejected. Ownership precedes the
  busy response and the application-lifetime in-flight guard releases in
  `finally`. Existing transport retries are not mislabeled as one network call.
- The exact application message/schema envelope is measured in UTF-8 bytes
  with the labeled 1,024-byte reserve and checked against 32,000 immediately
  before inference. Section quotas, complete entries, Unicode-safe prefixes,
  JSON escaping, omission counts and fixed-envelope failure have explicit tests.
  Use the same schema conversion supplied to the adapter when implementing.
- The input whitelist includes numeric hunk anchors and bounded saved text
  specifications, excluding `pr_files.patch`, raw diff and repository source.
  Keep a sentinel in the patch body for the exclusion test; PR description and
  attached-spec prose are deliberately permitted inputs.
- Output grounding uses the full captured changed/caller path union even when
  model facts are truncated. Invalid references are removed, empty risks are
  dropped and focus order is preserved without invented replacement items.
- Context lists/writes require workspace, repository and `source=spec`, with
  parent ownership checks and a shared transaction advisory lock for same-path
  replacements. Code/docs rows survive; content size is actual UTF-8 bytes;
  the existing schema does not support a fabricated update timestamp.
- Page-level URL navigation preserves unrelated parameters. Generic target
  props and element refs expand role/file before scrolling to a RIGHT row,
  preserving comments/drafts and allowing later manual collapse. Tests include
  original/grouped modes, repeat navigation, unusual paths, missing rows and
  caller-only targets; no unescaped path selector is needed.

## Remaining limits and verification handoff

The existing index cache is not atomic during concurrent reindexing. This plan
reuses its separately identified indexed SHA and preserves degradation/coverage
information; it must not promise a versioned symbol snapshot or prove runtime
endpoint invocation. The generation guard covers the current single server,
not a multi-instance deployment. Missing Intent/issue/spec facts stay explicit.

The plan-verifier must check artifact-before-code Git history, actual budget
values, input exclusion, retained-cache failure behavior, metadata-only head
advance, cache-upsert races, attachment isolation and client focus behavior.
Provider spies, database tests and actual Codex/browser observations must remain
separate. No runtime/model/browser calls or package tests were performed by this
reviewer at the planning stage; only repository reads and this review file were
authorized. Spec/plan/review must be committed before feature code begins.
