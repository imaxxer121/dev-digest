# L06 — DevDigest Eval Pipeline specification

Status: agent-authored specification; implementation, verification and experiment results are pending.
Stage: `spec-creator`, 2026-10-13. Baseline: L05 `97df136`, branch `feat/l06-eval-pipeline`.
Primary requirements: the complete GoIT homework snapshot in `work/l06-requirements.txt` outside this checkout, supplemented by the user's SDD/evidence constraints and the repository inspected at this baseline. The lesson heading mentions export, but the supplied homework/lab core does not require an export implementation; this specification covers the product evaluation pipeline.

## Goals

Turn actual accepted/dismissed review findings into a regression dataset for their source agent. Freeze the exact source-review diff fragment and a typed positional expectation once, then evaluate agent prompt/model/linked-skill configurations against the same saved inputs.

Make recall, precision and citation accuracy deterministic code computations. Save durable comparable batch history, expose cases/history/two-run comparison in AgentEditor Evals, and show recent agent batches in a sidebar Eval Dashboard. Demonstrate at least eight genuine source cases with both expectation types and a real old/improved/deliberately bad prompt experiment.

Follow SDD: create this specification, create an agent-authored implementation plan, commit both before feature implementation, execute the plan and independently verify it. Supply a green `pnpm verify:l06`, a comparison screenshot and a narrated end-to-end screencast. Use the available subscription-backed Codex provider; disclose that Claude Code is unavailable rather than claiming it was used.

## Non-goals

- CI/agent export, workflow installation, composed GitHub review posting, conformance checks, skill harness evaluation, hooks, mutation testing or metric trend charts.
- Hand-authored scenarios, a manual case editor, editing an existing frozen case, synthetic cases presented as real decisions, or seeded findings presented as actual model evidence.
- Semantic judging of rationale/title, model-based scoring, LLM-as-a-judge, or treating positional success as proof that an explanation is correct.
- Live Git/GitHub/index/spec/memory retrieval while evaluating frozen cases. This core measures a versioned diff-review profile, with source PR title/description when frozen, current snapshotted prompt/model and linked skill bodies. It does not reproduce live changing repo-intel context.
- Automatically running evals on GET, opening Evals, saving a prompt, linking a skill or reloading. All inference requires an explicit Run evals action.
- A distributed durable worker queue or multi-server execution recovery. The existing app is a single API process; interrupted batches must be marked failed honestly.

## Baseline, architecture and observed gaps

Root/server/client `AGENTS.md`, architecture notes and INSIGHTS apply. Routes validate/authenticate and call services; repositories own scoped SQL; model/Git/GitHub adapters remain at the edge. Apply onion-architecture, frontend-architecture and pr-self-review. Match both vendored contracts, localize UI text, use existing theme components, and record verified insights after validation.

| Surface | Observed baseline | Required consequence |
| --- | --- | --- |
| `server/src/db/schema/eval.ts` | eval_cases already has diff/files/meta/expected JSON; eval_runs stores one case execution and nullable metrics | Extend narrowly; do not recreate starter tables or rewrite generated migration history |
| Mirrored `knowledge.ts` / `eval-ci.ts` | EvalCase inputs/expectations are unknown; EvalRun metrics and dashboard values often require numbers | Introduce typed frozen inputs/expectations and batch DTOs; allow undefined-denominator metrics as null in affected contracts |
| reviews/review.repo.ts and findings.ts | Findings join review→PR; decision actions clear the opposite timestamp; existing action guard checks only PR workspace | Eval creation must also validate review, source run, source agent and parent repository workspace; never inherit a weaker guard |
| RunTrace / run-executor.ts | Saved prompt_assembly.user contains a whole-diff trace assembly; historical trace has no explicit source head SHA/raw-diff field | Recover the actual source input from its trace, not current pr_files. Record unknown source SHA truthfully; optionally add exact source_diff/head metadata for future traces |
| reviewer-core reviewPullRequest | Returns grounded findings and dropped candidates; raw strings may concatenate map/reduce outputs | Preserve candidate/kept/dropped counts explicitly; do not estimate counts from log strings or parse concatenated JSON as a single result |
| reviewer-core grounding | General product gate permits scanner/full-file kinds and a fallback for empty new ranges | L06 diff-only citation gate must require real positive new-side hunk coverage; model-supplied kind cannot bypass it |
| Agent versions / linked skills | Agent versions retain config and skill IDs, but skill bodies can change independently; linkedSkills reads by agent ID | Snapshot actual ordered skill bodies/versions/digests/enabled state under workspace guards, not just IDs or agent version |
| AgentEditor | Config and Skills are implemented; no Evals tab/rendering | Add Evals cases, explicit run control, durable history and comparison |
| Sidebar | App-shell already recognizes `/eval`; dashboard page is absent | Add visible Eval Dashboard navigation and page |
| Package layout | No root package/workspace; separate pnpm server/client and npm reviewer-core | Add a minimal root verification entry point without turning packages into a new workspace or changing unrelated lockfiles |

The primary agent's inventory identifies 33 actual Codex findings and two seeded findings to exclude from the real dataset. Existing accept/dismiss decisions are sparse; curating additional genuine findings is authorized task work, but no result or label is certified by this specification. Security-focused expectations must explicitly state their scope: a dismissed UI/performance finding can be a valid issue outside the evaluated security rubric, rather than a universally false claim.

## Frozen case creation and provenance

`POST /findings/:id/eval-case` accepts an empty body or optional `{notes: string}` with a maximum of 2,000 characters. Notes are creation-only immutable curator metadata for interpreting scope, never model input; this supports truthful security-rubric dismissal without adding a manual case editor or case-edit route. The default UI remains one-click conversion. Resolve the target owner from the finding's source review agent; core owner_kind is `agent`. One click converts an already accepted finding to `must_find`, or an already dismissed finding to `must_not_flag`. A pending finding, missing/deleted source agent, ambiguous decision, unsupported scanner finding, missing source trace or ungrounded source location produces a clear HTTP 409 with no case and no inference.

Before dependent reads/writes, join and validate finding→review→PR→repository and source review→agent/run, requiring every workspace-bearing row to match the authenticated workspace and the run/agent/PR relationships to agree. A foreign/malformed relationship returns 404 with no model/Git/GitHub calls or database mutation. The source is a successful review, not a summary or an eval's own output.

Use the review's saved exact source_diff when present. For an existing trace, recover only the supported final generated `## Diff to review` / source=`diff` block from prompt_assembly.user. This is the actual source-review input, including for the whole-diff assembly of a map/reduce run. Validate framing and reject delimiter-escaping ambiguity or malformed/missing snapshots; do not reverse a lossy transformation or fall back to today's PR diff. A recorded source SHA is optional for historical traces and must remain null/unknown if not proven. Never substitute current PR head as the old source head.

Extract the source finding's complete file diff section, preserving original file headers, hunk headers, line numbers and body bytes. A whole file section is the deliberately narrow frozen fragment; it keeps meaningful context and valid line numbering. Require normal diff findings (`kind=finding` or legacy null), positive ordered source range, exact source path and real new-side hunk intersection. Do not renumber or silently truncate a fragment. Reject a fragment over 65,536 UTF-8 bytes with an explicit unsupported-size message. Future larger-fragment support is outside core.

Each immutable case contains these validated fields:

| Field | Meaning |
| --- | --- |
| id / owner_kind / owner_id / name | Stable case identity, source agent ownership, display label from source finding |
| input_diff | Exact frozen source file diff section; never fetched again during evaluation |
| input_files | Typed parsed file path/stat/hunk/new-side-line metadata sufficient for grounding |
| input_meta | Versioned frozen PR title/description, supported source input profile, input digest and source provenance |
| expected_output | Discriminated expectation `{kind: must_find or must_not_flag, file, start_line, end_line}` with positive ordered range |
| notes | Human curator explanation, including scope-dependent dismissed rationale; display/scoring data only |
| source provenance | Workspace/repo IDs, PR ID/number, review ID, source run ID, source finding ID, source agent ID, captured decision/timestamp, creation timestamp, known source head or null, exact diff digest, source retrieval method |

The typed metadata separates **model input** (diff, frozen PR title/description and neutral task framing) from **provenance/expectations** (finding title/rationale, decision, expected location, notes, prior model findings or verdict). Only the former enters generation. Case names may reveal the target defect and therefore must not be used as model task labels.

Case creation is idempotent per workspace/source agent/source finding: a duplicate request returns the first frozen case with HTTP 200; initial creation returns 201. Enforce concurrency with a unique source identity and transaction. A later accept/dismiss change cannot rewrite the saved expectation or input; the UI explains the existing case preserves its original decision. Cases and completed batch snapshots survive deletion of source review/finding records; source IDs remain provenance rather than cascade-delete dependencies. Core supplies no case-edit/delete route.

`GET /agents/:id/eval-cases` lists this scoped agent's immutable cases in deterministic creation/id order and validates their typed JSON. It contains no model or external I/O. An invalid legacy case is identified as unsupported, not silently treated as an empty positive case. The real demonstration dataset must have at least eight distinct genuine source findings, both kinds and meaningful source ranges; repeated creation of one finding cannot satisfy the count.

## Durable batch execution and reproducibility

Add a narrow `eval_batches` table and a new migration. Each batch owns workspace/agent, status, start/completion timestamps, immutable snapshot JSON, aggregate result/counts and optional error. Add nullable batch linkage to existing eval_runs for backward compatibility, plus source-case identity support needed for unique conversion. Existing unbatched rows remain historical data and must not be fabricated into comparable batches.

`POST /agents/:id/eval-runs` accepts an empty body and runs all valid cases belonging to the agent. It resolves agent and cases with workspace/repository guards, snapshots them and the actual agent/skills in one consistent database transaction, persists a running batch, then returns HTTP 202 `{batch_id, status: running}`. Work proceeds asynchronously through the service, sequentially across distinct frozen inputs. A zero-case suite returns 409 before inference. Reject unsupported/invalid cases and contradictory positive/negative overlapping targets for the same frozen input before starting rather than skipping them invisibly.

The immutable batch snapshot contains:

- Exact ordered case IDs, frozen diffs/parsed metadata and expectations, their source/input digests, and complete curator/provenance records needed to inspect history.
- Agent ID/name/version, provider/model, exact system prompt, configured strategy/output schema/repo-intel flag and the effective eval runner profile.
- Ordered linked skill IDs/names/order/versions/bodies/digests/enabled flags. Only enabled bodies enter the model. Reject a malformed foreign-workspace skill link before creating the batch.
- Effective structured schema (`Review`), single-file diff execution, structured reprompt budget zero, prompt-assembly/runner version, deterministic scorer version and strict citation-gate version. Existing custom output-schema settings remain recorded; the effective schema follows the product review engine's existing Review behavior.
- `dataset_digest` over canonical sorted case identities plus immutable model inputs **and expectations**; `input_digest` over only each group's model-visible frozen input; `config_digest` over the actual agent/effective enabled skills; and a comparison key combining dataset/input profile/scorer/gate versions, excluding the prompt configuration being compared.

Use SHA-256 over a defined canonical UTF-8 representation with stable object keys/array ordering. Retain the data behind each digest; a hash alone does not make a mutable source reproducible. An agent/skill/decision/PR update after POST cannot change an in-flight or historical batch.

Cases with the same frozen model-input digest are evaluated once as one input group against all their included expectations. This avoids duplicate model calls and prevents repeated copies of the same prediction from inflating batch denominators. It also lets multiple accepted/dismissed locations on one source file be labeled together. Every member case receives an eval_runs result associated with the same batch/input digest; aggregate counts are computed once per input group, never by averaging/summing duplicated per-case group metrics.

The generation service uses the existing injected provider and shared review prompt assembly/engine, with the snapshotted system prompt/model and enabled skill bodies, frozen diff/PR description and a neutral task. Each group is a single-file review; core makes one structured completion per group with maxRetries zero. Do not pass any expectation, source finding title/rationale, decision, curator note, case label or previous eval result into messages. Do not make a scoring completion or invoke Git/GitHub/repo-intel/embeddings. The core explicitly omits live memory/spec/caller/repo-map context, and that omission belongs to the versioned eval profile shown in history.

Persist each group's actual structured output/candidate findings, strict grounded findings, rejected citations/reasons, case matches/pass decisions, count numerators/denominators, latency, real provider tokens/nullable cost, and error/status. Numeric scoring is a pure synchronous function with no provider/container/file/network dependency. Continue remaining groups after a group failure, recording the failure rather than an empty review.

Completed means every planned group succeeded. Partial means some succeeded and some failed; failed means none succeeded or the execution was interrupted. Per-failed-case pass and metrics are null. Overall recall/precision/citation accuracy are null for partial/failed batches; show success/failure counts and real successful group details, without presenting a completed-suite score. Zero outputs from a successful group are genuine empty predictions, distinct from failure. On startup, mark orphaned running batches failed/interrupted; no hidden rerun. Prevent competing same-agent batches or return 409 while one is running; UI disables Run while pending. This is adequate for the current single API process.

`GET /agents/:id/eval-runs` returns scoped batch history, newest first with timestamp/id tie break; `GET /eval-runs/:batchId` returns a scoped snapshot/result/progress; `GET /eval-dashboard` returns latest/recent scoped agent batches. These reads never execute inference, mutate cases/batches, or refresh sources. Poll running batch detail from the client; completed history survives reload.

## Deterministic scoring definition

The scorer consumes typed expectations and the complete **pre-grounding candidate set** for each input group, plus its frozen diff. Obtain candidates explicitly from the structured engine output, or faithfully combine the existing kept and dropped candidates; do not count log text, opaque raw JSON, or only the post-grounding array.

Exact repository-relative POSIX path equality and inclusive range overlap are the only matching rules: same file and `prediction.start <= expectation.end && expectation.start <= prediction.end`. No title/rationale similarity, category matching, judge call or substring heuristic earns credit. This measures positional behavior against a finite curated rubric; unrelated legitimate defects can still be noise for that dataset, and semantically wrong comments at an expected location can match. State this limitation in the UI/evidence.

Strict citation grounding requires an exact frozen file path, positive ordered integer prediction range and overlap with a real positive new-side line in a hunk with nonzero new-line count. Exclude synthetic ranges for deleted-only hunks and numbers outside the declared new-side range. Model-supplied hook/scanner kinds do not waive this diff-only gate. Citation failures remain visible candidates and count as noise rather than disappearing from precision.

Within each input group, first exclude any candidate overlapping a must_not_flag target from positive matching. Match remaining grounded candidates one-to-one to must_find expectations using a deterministic maximum-cardinality matching with stable case/candidate tie breaks. One prediction cannot credit multiple expected positives; extra duplicates cannot inflate recall. Positives/negatives whose target ranges overlap for the same input are contradictory for this positional scorer and must be rejected before generation.

| Count / metric | Definition |
| --- | --- |
| expected_positives | Number of must_find expectations in successful complete-suite groups |
| true_positives | Maximum one-to-one grounded positive matches |
| false_negatives | expected_positives minus true_positives |
| raw_candidates | All structured pre-grounding predictions, counted once per distinct input group |
| grounded_candidates | Candidates surviving the strict citation gate |
| false_positives | raw_candidates minus true_positives: unmatched, negative-target overlaps, ungrounded predictions and excess duplicate predictions are all noise |
| recall | true_positives / expected_positives; null when expected_positives is zero |
| precision | true_positives / raw_candidates; null when raw_candidates is zero |
| citation_accuracy | grounded_candidates / raw_candidates; null when raw_candidates is zero |
| Positive case pass | Its must_find expectation participates in a credited match |
| Negative case pass | No raw prediction overlaps its must_not_flag file/range |

For a completed batch, sum group numerators/denominators first and divide once; do not average ratios. A successful empty reviewer on positive cases has recall zero and precision/citation null, not invented perfect scores. A negative-only empty group can pass its expectation while all three ratio denominators are undefined. Null is displayed as `—` with a denominator explanation; true zero remains 0%. Preserve integers and ratio precision in storage; round only display. Nullable/unknown provider cost stays unknown through aggregation, never a partial dollar sum presented as total.

## UI and comparison contract

FindingCard displays a keyboard-accessible Turn into eval case action after a persisted accept/dismiss decision. The action is separate from accepting/dismissing, disables during save, reports created/existing state and visible errors, and targets the source review agent automatically. It does not generate an eval or alter the source decision. Add the action in both existing findings-card uses without duplicating mutation ownership in unrelated shared diff components.

AgentEditor gains an Evals tab using existing query-param tab navigation. It lists case name/type/file/range/source PR and immutable input provenance, supports inspecting the frozen diff, shows case counts/both expectation types, and supplies explicit Run evals with pending progress/errors. History shows batch identity, actual provider/model, agent version/prompt/config digest, case/group counts, status, three nullable metrics and real cost/latency. Failure is visible and cannot look like a clean review.

Select two history batches for a side-by-side comparison. Show their stored prompts/skill/model snapshots or inspectable differences, dataset/comparison keys, statuses, raw/grounded/TP/FP/FN counts and three metrics/deltas. Show metric deltas only when both batches completed, comparison keys match and the individual metrics are defined. If the suite/input/scorer/gate changed, mark them not comparable and explain why; do not silently compare today's cases to an old run or treat undefined metrics as zero.

Add `/eval` or `/eval-dashboard` as a visible sidebar Eval Dashboard page, consistent with the existing shell key. Show agents' latest eval batch and recent launched batches with actual statuses and links to AgentEditor Evals/comparison. Scope all counts/rows to the workspace; optionally filter by agent without changing data. No trend graph is necessary. Keep new copy in appropriate next-intl namespaces and use existing theme controls/loading/empty/error patterns.

## EARS acceptance criteria

| ID | Requirement |
| --- | --- |
| L06-01 | When an accepted/dismissed actual source finding is converted, the system shall save an immutable must_find/must_not_flag case respectively with its exact frozen source-review fragment and provenance. |
| L06-02 | When the same source finding conversion is repeated or concurrent, the system shall return the first saved case without changing its input/expectation or creating a duplicate. |
| L06-03 | When a source is pending, missing, ambiguous, unsupported or cannot be frozen exactly, the system shall show a clear creation failure and shall not substitute current PR data. |
| L06-04 | Where any finding/review/run/agent/PR/repo/skill relationship belongs to another workspace or is malformed, the system shall return 404 before inference/external I/O and perform no database mutation. |
| L06-05 | When AgentEditor Evals is opened, the system shall display the scoped saved cases and history without invoking a model. |
| L06-06 | When an explicit Run evals starts, the system shall durably snapshot all cases, exact agent configuration and ordered linked skill bodies before background execution. |
| L06-07 | While an eval batch runs, later prompt/skill/PR/decision edits shall not change its frozen model inputs, expectations or configuration. |
| L06-08 | When identical frozen inputs occur in multiple cases, the system shall generate once for that input group and count its candidates once in aggregate metrics. |
| L06-09 | When generating eval predictions, the model shall receive no expectations, decisions, case/source finding labels, scorer output or prior eval answers. |
| L06-10 | When scoring outputs, pure deterministic code shall compute exact-file/range-overlap recall, strict precision and citation_accuracy with zero model calls. |
| L06-11 | Where a ratio denominator is zero, the system shall store/display null and its reason; where a group fails, it shall retain an error rather than fabricate an empty output or score. |
| L06-12 | When a batch is partial/failed/interrupted, overall metrics shall remain null and its actual successful/failed counts shall be visible after reload. |
| L06-13 | When two completed history batches share the same comparison key, the interface shall compare stored snapshots/counts/metrics side by side; otherwise it shall explain the mismatch and suppress misleading deltas. |
| L06-14 | When Eval Dashboard is opened through the sidebar, the system shall show the workspace's latest/recent agent eval batches with real status and Evals links. |
| L06-15 | Before the real experiment, the agent's dataset shall contain at least eight distinct authentic source findings, both expectation kinds and recorded curator decisions/notes, excluding seeded evidence. |
| L06-16 | When old and improved system prompts run on the same unchanged suite/model/skills/profile, their actual recall and/or precision shall visibly differ; when the prompt is deliberately degraded, actual precision shall fall relative to a comparable successful run. |
| L06-17 | When `pnpm verify:l06` runs from the checkout root, it shall run deterministic required checks and exit nonzero on failure, without paid/subscription model calls or external publication. |
| L06-18 | Before submission, agent-authored spec/plan and verifier evidence shall exist, the verification command shall pass, and a comparison screenshot plus narrated end-to-end video shall show creation→run→metrics→prompt change→second run→comparison. |

## Implementation and evidence handoff

The implementation-planner must map criteria to routes/contracts/repository/migration/service/scorer/UI/verification checks, name practical execution bounds and reconciliation behavior, and preserve this narrow core scope. Commit spec and plan before implementation. Do not overwrite existing migration history; add a migration for durable batches, batch linkage and source identity constraints.

Use `modules/evals/{routes,service,repository}` and pure scorer/strict-grounding/snapshot-digest helpers. Keep provider access inside execution service and the scorer dependency-free. Guard all polymorphic owner IDs with a real workspace-owned agent lookup. Scope case/source repos both when snapshotting and when listing; historical frozen data remains valid without mutating/re-reading deleted sources. Extend matching client/server knowledge/eval-ci contracts and expose shared DTOs; no custom raw unknown JSON is permitted at new API boundaries.

Add page-local Evals/history/comparison components and hooks under existing client conventions, a sidebar dashboard, and the FindingCard conversion action. Validate actual current input snapshots and error recovery, keyboard interaction, reload persistence and comparison incompatibility; do not infer UI correctness solely from typechecking.

Provide a minimal root `package.json` verification script or equivalent pnpm entry point calling a cross-platform checked script under `scripts/`. `pnpm verify:l06` must cover affected server/client/reviewer-core typechecks, pure scorer/grounding/digest/contract tests, route/workspace/idempotence/snapshot/failure integration behavior and Evals/comparison/dashboard interactions. A real database integration prerequisite may be explicit, but skipping it must not print a misleading fully green verification. Deterministic verification never invokes an LLM; record the actual command/results separately from experiment evidence.

Tests must include overlapping and nonoverlapping ranges, wrong files, negative targets, duplicates/one-to-one matching, unmatched and ungrounded false positives, deleted-only hunks, scanner-kind bypass attempts, all-positive/all-negative/empty prediction denominator cases, aggregate count weighting, partial errors, stable/different digests, immutable concurrent conversion, source deletion/review refresh, foreign review/PR/parent repo/agent/skill links, exact historical extraction and escaped/missing source rejection, model-message expectation sentinels, snapshot edits mid-run, and zero calls from scoring/history/list reads. Use mocked outputs only for deterministic correctness, labeled separately from real generation.

The primary agent curates actual accepted/dismissed source findings and records source run IDs/diff digests. Freeze the suite, model, skills and eval profile before the prompt experiment. Save old and improved prompt snapshots and run them genuinely; then save a deliberately bad prompt and record its actual predictions/precision. Do not invent metric movement, choose a mocked response as evidence, rewrite expectations after viewing results to create an improvement, or conceal failed exploratory batches. If the desired movement is absent, revise the prompt and rerun transparently while preserving history; report the observed results and limitations.

Capture the comparison screenshot and a narrated end-to-end screencast showing the source decision/conversion, case list, first run/progress/metrics, changed system prompt, second run and comparison; also show the bad-prompt precision sensitivity and dashboard where practical. Record actual Codex provider/model and nullable cost, disclose Claude unavailability, and explain that scoring is positional deterministic code rather than a semantic judge. The video is required; a textual report alone is insufficient. Plan-verifier must link every criterion to real code/test/runtime evidence and leave any unmet submission requirement openly unresolved.
