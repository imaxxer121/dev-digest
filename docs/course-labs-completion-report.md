# L03/L05 laboratory completion

16 October 2026. This follow-up completes the laboratory prerequisites missing
from the earlier Smart Diff and PR Brief submissions. The agreed
[specification](../specs/course-labs-completion/spec.md) and
[plan](../specs/course-labs-completion/plan.md) were committed as `7dc2a005`
before feature implementation. The original integration baseline was `b826857`.
This report separates implemented behavior, deterministic checks and real model
observations. Course submission and video upload remain held by the owner.

## Result

The development harness defines eleven scoped roles and a dependency-aware
run-plan workflow with disjoint writers, independent architecture/acceptance
gates, no nested writers and at most three repair rounds. Intent is inferred
from allowlisted PR metadata, persisted with head/generation provenance and
shown independently before Brief. Its purpose and scope remain untrusted review
input and cannot waive a real defect.

Project Context discovers bounded Markdown from the selected repository clone.
Agents and enabled, linked Skills save ordered repository-qualified paths.
Each review freshly reads its own documents, deduplicates inheritance and sends
whole guarded documents through the existing core input. Trace records the
actual documents, omissions, UTF-8 bytes and labeled token estimate. These local
attachments are explicitly excluded from CI exports.

## Deterministic verification

The root executed `node scripts/verify-l06.mjs`: three package typechecks,
mirrored contracts, **281 server unit tests, 38 required PostgreSQL eval tests,
153 client tests and 26 core tests passed**. The retained complete verification
log has SHA256 `449011ca0d1cd93fe90ae8396d75132722edad25b8567521c7c5ef1103488766`.

The broader PostgreSQL integration run passed 136 tests and skipped two after a
parallel Docker availability timeout. The skipped file,
`server/test/repo-intel-symbol-clamp.it.test.ts`, was then run separately and
passed **2/2 with zero skips**. The first run is not represented as skip-free.
Its log has SHA256
`c9dedb75e15a9071f6c3d92b1e92421b4da9b710e0b767c37b070bfe55dfa3a8`.

One independent review found a cache race: an older in-flight GET could replace
successful recalculation data. The hook now awaits cancellation of the exact
origin PR query before writing the POST result. Two deferred-response/navigation
regressions first failed against the old behavior; the focused hook/card suite
then passed **9/9**, with client typecheck passing. Independent re-review closed
the finding. Final mixed-diff self-review reported no new material findings;
verified discoveries are in the three module INSIGHTS files.

| Required criteria | Source/check evidence | Observed status |
| --- | --- | --- |
| AC-L03-01 | `.claude/agents/`, `scripts/check-development-agents.mjs`, registry | Eleven profiles; nine original roles and six read-only allowlists checked. |
| AC-L05-01 | spec/planner profiles, run-plan and workflow-retro | Defined permissions, DAG, independent gates, bounded fixes and manual retro. |
| AC-L05-02 | prior spec/plan commit and independent gate records | T1/T2/T3 disjoint ready set, then integration, independent gates and one repair. |
| AC-L05-03 | `retros/course-labs-completion.md`, ledger | Unknown worker accounting retained as unknown; separate measured CLI runs. |
| AC-I-01 | `server/test/intent.test.ts` | Source/diff sentinels excluded from metadata request; empty metadata covered. |
| AC-I-02 | `server/test/intent.it.test.ts`, model settings | Scoped persistence and selected review_intent provider/model. |
| AC-I-03 | Intent unit/PG tests, client hook regressions | Explicit POST, failed/stale generation retains prior result; GET has no inference. |
| AC-I-04 | IntentCard/Overview RTL and real PR22 screenshots/cache JSON | Independent card before Brief; states covered; reload preserves generation. |
| AC-I-05 | `course-labs-orchestration.test.ts`, `course-labs-runtime.it.test.ts` | Once per batch, per-agent isolation, both review strategies and trace input. |
| AC-I-06 | failure-injected orchestration/runtime cases | Degraded review continues without fabricated scope. |
| AC-I-07 | `reviewer-core/test/intent.test.ts` | Guarded Intent never excuses vulnerabilities; core stays I/O-free. |
| AC-PC-01 | `project-context-files.test.ts` | Recursive roots, duplicates, vendor exclusion and configured roots. |
| AC-PC-02 | filesystem and browser states | Missing/limited/empty/error scans reported explicitly. |
| AC-PC-03 | Project Context components and actual local browser preview | Sidebar, path search and safe read-only Markdown. |
| AC-PC-04 | `attached-docs.it.test.ts`, component tests and reload receipt | Agent v1 and Skill v1 retained; ordered path bindings persist. |
| AC-PC-05 | resolver/runtime tests and real trace | Agent-first inheritance, enabled loaded Skills, duplicate kept once. |
| AC-PC-06 | deferred concurrent runtime tests | Separate immutable agent document snapshots and traces. |
| AC-PC-07 | fresh disk-read runtime fixture | Changed document content is read immediately before the next review. |
| AC-PC-08 | exact wrapped-block/core regressions | Source labels and unconditional untrusted-input guard remain. |
| AC-PC-09 | filesystem/resolver adversarial cases | Unsafe/missing/oversized/over-budget whole documents skipped with reasons. |
| AC-PC-10 | provider/network spies and real run accounting | Context adds no selection/embedding/model call; Intent counted separately. |
| AC-PC-11 | actual PostgreSQL ownership cases | Foreign owner/parent/binding rejected before adapter/provider work. |
| AC-PC-12 | filesystem adversarial tests | Canonical paths, ancestor and symlink/junction protections at read time. |
| AC-PC-13 | persisted trace tests and real trace | Exact read list, guarded block, 1264 bytes and 316 estimated tokens. |
| AC-PC-14 | legacy drawer/CI/eval regressions | Optional old fields remain compatible; unknown usage stays unknown. |
| AC-COMP-01 | existing context/Brief integration suites | Saved text attachments remain a distinct, scoped feature. |
| AC-COMP-02 | `brief-byte-budget.json` and reproduction script | Actual retained request envelope 12314 + reserve 1024 = 13338 ≤ 32000 bytes. |
| AC-COMP-03 | integrated verification command above | Relevant tests/typechecks/shared mirrors pass. |
| AC-EVID-01 | this matrix and actual provider/trace artifacts | Fixtures and actual model runs separately attributed. |
| AC-EVID-02 | owner hold and run-plan permission boundary | Workers made no remote writes; separately authorized root publishes code. Media/submission held. |

## Actual model and browser observations

PR22 Intent was generated through the visible Settings override and explicit
recalculate button with Codex `gpt-6.1-sol`: **11722 input / 149 output tokens**.
Generation `349055a0-2b65-4d7c-b8f4-3a39e5cf9e3c` persisted; saved JSON before and
after browser reload is equal. Cost is null because the subscription provider
does not expose billed USD. No Claude inference is claimed.

For [PR25](https://github.com/imaxxer121/dev-digest/pull/25), the browser saved
the agent attachment `docs/course-context/api-boundary.md`. The Skill saved
`review-evidence.md` then `api-boundary.md`; both editors restored their saved
order and version 1 after reload. The two public reference documents were
copied from PR25's committed fixture into the configured local clone; the
clone's checked-out HEAD was not changed. This is fresh filesystem reference
context, not a claim of checkout parity with the PR head.

Two browser automation locator attempts did not start a review. One subsequent
explicit local API POST selected only the Context reviewer. Run
`5518a1e8-c918-4508-a6bd-7537314bbb6f` completed with **13686 input / 200 output
tokens**, 7814 ms review duration, null billed USD and one grounded WARNING at
`demo/course-context/api/health.mjs:1`. The rationale cites
`docs/course-context/api-boundary.md:5–9` and distinguishes the policy violation
from SQL injection. The saved trace was then inspected in the actual browser.

Trace shows two unique documents, no skipped files, **1264 UTF-8 bytes / 316
estimated tokens**, including wrappers and source labels. These estimates are
not the provider's billed token counters. Intent classification is one separate
call (**11533 input / 149 output tokens**) shared by the one-agent batch. Context
itself added no extra model call. This controlled case establishes the observed
mechanics and finding, not general reviewer accuracy.

The current [evidence directory](evidence/course-labs-completion/) retains
settings/cache/attachment receipts, the exact public fixture prompt and result,
the trace and Brief budget reproduction. Screenshots are delivered separately.
The Brief evidence recomputes the two actual October 12 calls; it is not a newly
generated Brief and does not conflate UTF-8 bytes with estimated tokens.

## Delivery

L06's additional development-harness eval package is separate from the existing
product finding evals. Its own deterministic and real-model outcomes, including
failed attempts, are reported separately. [L07](l07-report.md) also retains its
actual open false-positive CI gate; no new administrator bypass was used.

The code and reports are reviewable before course delivery. No new video has
been uploaded, no homework form has been submitted and no mentor has been messaged.
