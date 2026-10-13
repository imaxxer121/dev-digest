# L06 — Eval Pipeline implementation plan

Status: agent-authored plan; implementation, checks and experiment pending. Stage: `implementation-planner`, 2026-10-13. Input: `specs/eval-pipeline.md` (18 EARS criteria), complete homework snapshot `../l06-requirements.txt`, current AGENTS/INSIGHTS/architecture and actual source inventories. Baseline `97df136`, branch `feat/l06-eval-pipeline`.

## Gate, ownership and sequence

Root reviews this plan with the independent architecture reviewer, resolves blocking findings, and commits **spec + plan before any implementation code**. Record the artifact SHA. This session uses Codex; do not claim Claude Code. After the gate, root publishes the immutable contract below in both vendored copies and signals server/client implementers. Subsequent contract change requires explicit coordinated handoff, never independently guessed UI fields.

| Owner | Files and responsibility |
| --- | --- |
| Root/contracts | Identical `server/src/vendor/shared/contracts/eval-pipeline.ts` and client copy, barrel exports; optional future-source fields in both trace contracts. Preserve unused legacy EvalRun/EvalDashboard rather than breaking scaffolding. |
| Server implementer | `server/src/db/schema/eval.ts`, schema exports and one new migration; `modules/evals/{routes,service,repository,executor,source,snapshot,scorer,grounding,constants}.ts`; container/module/startup wiring; server tests. |
| Server implementer | Narrow `reviews/run-executor.ts` addition of exact source_diff/source_head_sha/source PR metadata to future saved traces; no live review/scoring behavior change. |
| Client implementer | `src/lib/hooks/evals.ts`; AgentEditor Evals tab/components; PR-local FindingCard conversion; `/eval/page.tsx` and dashboard components; sidebar/nav; eval/prReview localized messages and interaction tests. |
| Root/integration | Minimal root `package.json`, cross-platform `scripts/verify-l06.mjs`; required suite integration/checks, actual curation/three-prompt experiment, browser/screenshot/narrated video, mixed self-review, verified INSIGHTS and `specs/eval-pipeline-verification.md`. |

Read module guides before edits; apply existing onion-architecture, frontend-architecture and pr-self-review. Provider I/O stays in executor/container ports; SQL stays repository; source/digest/gate/scorer helpers stay pure. Server/client may work concurrently after contract handoff. No CI/export/manual-case editor/trend/hook/mutation stretch work.

## Fixed wire contract

All IDs are UUID strings, timestamps ISO strings, paths exact repository-relative POSIX, ratios `[0,1] | null`, counts nonnegative integers. Use typed recursive JSON for configured output_schema, never a new API z.unknown boundary. Root exports these names/shapes from **eval-pipeline.ts**; client imports runtime Zod schemas directly from that file because shared barrel `.js` runtime exports previously failed Next resolution.

- `EvalExpectation`: `{kind:'must_find'|'must_not_flag',file,start_line,end_line}` with positive ordered integers.
- `EvalSource`: `{workspace_id,repo_id,pr_id,pr_number,review_id,run_id,finding_id,agent_id,decision:'accepted'|'dismissed',decision_at,source_head_sha:string|null,diff_digest,retrieval:'trace-source-diff'|'trace-diff-block'}`. No cascading FK to source IDs.
- `EvalInputMeta`: `{version:1,profile:'diff-only-v1',pr_title:string|null,pr_description:string|null,input_digest,source:EvalSource}`. Provenance and case labels are separate from model-visible frozen diff/title/description.
- `FrozenEvalCase`: `{id,owner_kind:'agent',owner_id,name,input_diff,input_files:DiffFile[],input_meta:EvalInputMeta,expected_output:EvalExpectation,notes:string|null,created_at}`. DiffFile/hunks are validated typed existing metadata with strict positive new-side coverage; retain exact raw diff separately.
- `EvalCaseCollection`: `{cases:FrozenEvalCase[],unsupported:[{id,name,reason}]}`; malformed legacy records are identified, never silently skipped as successful cases. `EvalCaseConversion`: `{case:FrozenEvalCase,created:boolean}`; first POST201, idempotent POST200.
- `EvalCounts`: `{expected_positives,true_positives,false_negatives,raw_candidates,grounded_candidates,false_positives}`. `EvalMetrics`: `{recall,precision,citation_accuracy}` nullable ratios. Metric reasons derive from stored integer denominators and batch status, not zeros substituted for null.
- `EvalProfile`: `{id:'diff-only-v1',runner_version:'1',prompt_assembly_version:'1',scorer_version:'1',citation_gate_version:'1',effective_schema:'Review',schema_json:JsonValue,strategy:'single-pass',max_retries:0,context:'frozen-diff-pr-skills'}`. Store the actual serialized Review JSON schema supplied to inference, not just its name; profile/comparison digest includes it.
- `EvalAgentSnapshot`: `{id,name,version,provider,model,system_prompt,strategy,output_schema:JsonValue|null,repo_intel,ci_fail_on}` records configured values. `EvalSkillSnapshot`: `{id,name,order,version,body,digest,enabled}`; arrays ordered by saved order then ID, including disabled skills.
- `EvalInputGroup`: `{input_digest,case_ids:string[],input_diff,input_files:DiffFile[],pr_title:string|null,pr_description:string|null}`. `EvalBatchSnapshot`: `{version:1,agent:EvalAgentSnapshot,skills:EvalSkillSnapshot[],cases:FrozenEvalCase[],groups:EvalInputGroup[],profile:EvalProfile,dataset_digest,config_digest,comparison_key}`.
- `EvalCaseResult`: `{case_id,pass:boolean|null,matched_candidate_index:number|null}`. `EvalGroupResult`: `{input_digest,case_ids,status:'pending'|'running'|'completed'|'failed',error:string|null,candidates:Finding[],grounded:Finding[],rejected:[{candidate_index,reason}],case_results:EvalCaseResult[],counts:EvalCounts|null,metrics:EvalMetrics,prompt_assembly:PromptAssembly|null,raw_output:string|null,structured_calls,structured_attempts:number|null,tokens_in:number|null,tokens_out:number|null,cost_usd:number|null,duration_ms}`. Failed groups retain errors/null passes, with any actually known output/usage; they never impersonate an empty success.
- `EvalBatchSummary`: `{id,agent_id,agent_name,status:'running'|'completed'|'partial'|'failed',started_at,completed_at:string|null,error:string|null,provider,model,agent_version,dataset_digest,config_digest,comparison_key,cases_total,groups_total,groups_succeeded,groups_failed,cases_passed,cases_failed,counts:EvalCounts|null,metrics:EvalMetrics,duration_ms:number|null,cost_usd:number|null}`. Partial counts may describe successful groups explicitly, but overall metrics remain null.
- `EvalBatchDetail`: summary fields plus `{snapshot:EvalBatchSnapshot,groups:EvalGroupResult[]}`. `EvalBatchStarted`: `{batch_id,status:'running'}`. `EvalDashboardResponse`: `{latest:EvalBatchSummary[],recent:EvalBatchSummary[]}`; latest one per agent, recent newest20, both scoped and tie-broken deterministically.

| Route | Behavior |
| --- | --- |
| `POST /findings/:id/eval-case` | Empty body or optional creation-only `{notes?:string max2000}`; automatic source-agent owner; 201/200 conversion envelope; unsupported/pending/ambiguous source409. First immutable record wins, including notes. |
| `GET /agents/:id/eval-cases` | 200 EvalCaseCollection; scoped typed cases/unsupported records, no inference. |
| `POST /agents/:id/eval-runs` | Empty body; preflight/snapshot/running row then202 EvalBatchStarted; zero/unsupported/contradictory/oversize suite409, competing agent run409. |
| `GET /agents/:id/eval-runs` | 200 EvalBatchSummary[] newest timestamp/ID first; unbatched legacy case runs are not fabricated into batches. |
| `GET /eval-runs/:batchId` | 200 EvalBatchDetail with stored progress/snapshot/results; no source refresh. |
| `GET /eval-dashboard` | 200 EvalDashboardResponse latest/recent stored batches. |

Existing UUID validation422/API `{error:{code,message,details}}` applies. Missing/foreign/malformed workspace relationships404 before I/O or writes. No case edit/delete or manual creation endpoint is added. Root records scope curator notes before freezing; optional notes support this without making the default one-click flow a form requirement.

## Bounded implementation tasks

**1. Storage and scoped source conversion.** Add eval_batches (workspace, agent identity, status, timestamps, immutable snapshot JSON, result/progress JSON, error), nullable eval_runs.batch_id and input_digest, and eval_cases source_finding_id/created_at plus unique `(workspace_id,owner_kind,owner_id,source_finding_id)` for nonnull source identities. Source IDs are provenance scalars, not cascade dependencies; cases survive source finding/review deletion. Preserve existing unbatched rows and generated migration history. Add a partial unique running-batch index on workspace+agent or equivalent transactional agent lock; races must return409 without double-start. Use current migrations generator/new migration path, not edits to old SQL.

Conversion joins finding→review→PR→repo and review→successful run/source agent; all workspace-bearing rows and run/agent/PR relationships must agree. Accept only review kind=review and source normal finding/legacy null, exclusive persisted decision, positive ordered range and strict new-side intersection. Owner is never accepted from request. Lock source decision and use transactional unique insertion; repeat returns first immutable saved case, including after decision change. A deleted source can no longer create a new case, while stored cases/batches remain readable without rejoining deleted findings/reviews.

**2. Exact historical source extraction.** Prefer saved exact source_diff; otherwise accept only supported final `## Diff to review` + source=diff wrapper in prompt_assembly.user, with validated unique framing and exact terminal delimiter. Reject escaped close-delimiter ambiguity, malformed/missing snapshots and lossy reverse transformations. Preserve bytes/newlines; extract one complete exact file section by parsed header identity, not substring `sliceDiff` or synthesized headers. Reject >65536 UTF-8 bytes or unsupported parsing; never current pr_files/Git/GitHub fallback. Take source PR metadata only from proven trace fields/framing; unproven historical title/head remain null rather than today's PR state. Future review traces add exact source_diff/source_head_sha and source_pr title/description to avoid ambiguity.

**3. Strict diff metadata, canonical digest and scorer.** Parse actual hunk body rows; exclude trailing empty split artifacts, `\\ No newline`/metadata and deleted-only synthetic rows. New line numbers must lie within declared positive nonzero new ranges and come from actual context/add rows; validate hunk framing/counts. Gate every prediction on exact path, positive ordered integer range and real new-side coverage, irrespective of model kind. Preserve every structured candidate and rejection reason.

Canonical SHA-256 uses recursively sorted object keys, exact UTF-8 strings and deterministic array order. input_digest covers only frozen model-visible diff/PR metadata/profile; dataset_digest covers sorted case IDs+inputs+expectations; config_digest covers actual agent/effective enabled skill bodies; comparison_key covers dataset+effective profile/scorer/gate versions, excluding prompt/model/skill configuration so stored configuration differences can be inspected. Retain complete data behind hashes. Contradictory positive/negative overlapping targets for one input are rejected preflight.

Pure synchronous `scoreGroup` first marks all raw negative-target overlaps as noise, then maximum-cardinality one-to-one matches remaining strict-grounded candidates to positives using stable sorted case IDs/candidate-index tie breaks (augmenting-path matching). Raw negative overlaps fail negative cases even when ungrounded. TP=matching size; FN=positives−TP; FP=raw−TP; citation numerator=strict kept count. Duplicates remain raw noise. Aggregate each unique input group once, sum integer counts then divide; no average of ratios/per-case duplicates. Zero denominator=null, real zero=0; partial/failed overall ratios=null. Any unknown group cost makes total unknown.

**4. Coherent immutable batch snapshot.** In an explicit REPEATABLE READ transaction, validate scoped agent/current cases/source repositories and every ordered skill link/body workspace, snapshot cases/config/skill bodies/digests/profile, check limits/conflicts, acquire same-agent running exclusion and insert batch. No source review/finding rereads are needed for existing frozen history; current parent repository guards cannot revive foreign records. Use deterministic ordering. Later decision/PR/prompt/skill edits cannot alter snapshot. Publish202 only after durable insert; register background execution with a handled rejection and persist failures.

Practical core bounds: <=128 cases, <=32 distinct input groups, <=16MiB canonical batch snapshot and <=128KiB serialized messages/schema per group; frozen file diff remains <=65536 bytes. Fail explicitly before inference rather than trim/change frozen inputs. Use current provider timeout capped at600000ms per group; at most one application structured call/attempt per group with maxRetries0, sequential groups. Limits are versioned/documented in constants and runner profile; actual experiment is much smaller. No automatic queued same-agent run/retry. Startup marks orphaned running batches failed/interrupted before accepting requests, keeps successful detail evidence, leaves overall metrics null and never reruns.

**5. Execution and durable results.** Use shared reviewer-core assemblePrompt and the existing strict Review schema with a single completeStructured call per group (effective single-pass); capture `res.data.findings` directly before any reduction/product grounding. This avoids raw concatenated JSON/log counting and preserves candidate order/counts. Snapshotted prompt/model/enabled bodies plus frozen diff/title/description and neutral task only; no names/expectations/notes/source answers/sentinels. Omit live memory/spec/repo-map/callers and record profile. Validate response/attempts=1, strict-ground then pure-score, persist group and each member eval_runs result atomically. Per-case group metrics may be shared for inspection but never used to sum aggregate denominators. Continue remaining groups on failures; terminal status derives all/some/no successes. GET paths read stored JSON only. Codex facts-only CLI restrictions remain active; no scorer/provider access or external source calls.

**6. Client.** Add direct-schema validated query/mutation hooks; cache scopes include original agent/batch captured at mutate start to survive route navigation. Mutation retry=false, POST only on explicit actions, running batch detail polling, terminal cache invalidation of history/dashboard. FindingCard has keyboard action after saved decision, disabled pending, created/existing/error states in both findings and inline uses; no duplicate mutation in shared DiffViewer. AgentEditor Evals lists immutable case/type/location/source/provenance, frozen diff inspection, count/kind summary, Run all, progress/errors/history and two selected full snapshots. Comparison shows prompts/skills/model/counts/profile/digests and suppresses deltas unless both completed, key equal and each ratio defined. Show null `—` and reason, never perfect-zero fiction. `/eval` sidebar page shows latest cards/recent table linked to `?tab=evals`; localize states and positional-rubric limitation. Use supplied design observations for three metric cards, typed cases, side-by-side metrics/prompt text; no stretch editor/trend requirement.

## Validation, experiment and acceptance mapping

`pnpm verify:l06` is a minimal root entry calling a cross-platform Node script with checked spawn exit codes; no workspace conversion/root install or unrelated lockfile change. Preflight real Docker/PostgreSQL integration availability and fail nonzero if unavailable; skipped integration cannot produce a misleading green result. Run server/client/reviewer-core typechecks, server deterministic pure+required DB route suites, client Evals/FindingCard/dashboard/comparison interactions, reviewer-core tests and mirrored contract parity. Fixtures inject providers/forbid all external calls. No model calls/publication occur in verification.

Required tests cover exact historical extraction/new metadata/escaped wrappers/source refresh and deletion; atomic duplicate conversion; foreign review/run/agent/PR/parent repo/skill; stable/different canonical digests; repeatable snapshot edits mid-run; same-agent race and startup interruption; identical input grouping/call counts; expectation-label-note sentinels absent from actual messages; pure zero-I/O scorer; max matching overlapping positives, wrong paths, negatives, duplicates, unmatched/ungrounded noise, deleted-only/trailer/scanner bypass; all-positive/all-negative/empty outputs/null denominators; weighted aggregate counts; group failure/partial unknown cost; GET/reload zero calls and UI pending/error/null/comparison mismatch/route races.

Root's pre-eval selection `../l06-dataset-selection.json` fixes exactly eight distinct actual Course Reviewer sources: six accepted PR5 security locations (crypto2/SSRF2/files1/redirect1) and dismissed PR1 keyboard/PR3 N+1 locations with truthful security-rubric notes. Dismissed can mean a valid issue outside this evaluated scope. The selection currently spans six frozen file inputs, so three prompts plan 18 group completions; no eval generation/result is certified yet. Use actual source findings/traces as inventory, not seeded evidence; conversion still validates live saved records. Record IDs/decisions/diff digests/retrieval and exclude two seed findings. Freeze dataset/model/skills/profile before experiment. Compare existing broad prompt→improved security-focus→deliberately noisy/style prompt genuinely on the same suite; preserve all exploratory/failing history, do not alter expectations to force movement. If metrics do not move, revise prompt and rerun transparently; acceptance remains unresolved until actual observed recall/precision movement and bad precision drop.

Capture actual Codex model/config snapshots, group call counts/pre-gate candidates/strict results/integer denominators/tokens/null cost; compare screenshot and browser checks of source conversion→cases→run/progress→metrics→prompt change→second run→comparison, plus bad prompt/dashboard. Record a narrated playable screencast using available native Russian Irina TTS if useful, synchronized to actual browser steps and disclosed as synthetic narration; no mock results or pretend student voice. Missing video or absent metric movement stays unresolved. Root independent verifier reports each criterion with code/test/runtime evidence and actual commands; mixed self-review/engineering insights follow validation.

| EARS | Implementation | Evidence |
| --- | --- | --- |
| L06-01 | Scoped conversion/exact frozen source/expectation | Source extraction+route tests; actual positive/negative UI/API conversion |
| L06-02 | Source unique identity+transaction | Concurrent/repeat/decision-change tests |
| L06-03 | Unsupported source409/no fallback | Pending/scanner/missing/escaped/oversize tests and visible UI error |
| L06-04 | Full relationship/workspace guards | Foreign/malformed cases zero calls+writes |
| L06-05 | GET cases/history+Evals tab | Read-only spy and actual tab/reload |
| L06-06 | Repeatable-read snapshot/running batch | Transaction/config/body snapshot integration |
| L06-07 | Frozen inputs/config/skills | Mid-run source/prompt/skill edit integration and stored comparison |
| L06-08 | input_digest groups/sequential executor | Same-input one call, one raw denominator tests |
| L06-09 | Neutral shared prompt assembly | Expectation/name/note sentinel request tests+actual saved prompt |
| L06-10 | Pure strict gate/max matching/scorer | Exact range/negative/duplicates/no-I/O unit suite |
| L06-11 | Null ratios/reasons+failed errors | Denominator/empty/failure tests+UI null/true zero |
| L06-12 | Group status/terminal aggregation/reaper | Partial/failed/interrupted integration+reload |
| L06-13 | Stored full snapshot comparison/key rule | UI matching/mismatched/null tests+actual screenshot |
| L06-14 | Sidebar `/eval` latest/recent | Scoped dashboard tests+browser page/links |
| L06-15 | Authentic immutable curated cases | >=8 unique source IDs/both kinds/notes, seed exclusions manifest |
| L06-16 | Frozen-suite real three-prompt experiment | Actual compared counts/metrics and bad precision fall; no synthetic claims |
| L06-17 | Root verify:l06 checked cross-platform script | Actual green command; failed prerequisite/test exits nonzero, zero LLM |
| L06-18 | Artifact gate/verifier/screenshot/narrated video | Earlier artifact SHA, report, actual comparison screenshot/playable recording |

After relevant checks pass, root records final file:line evidence and publication handoff. Planning is complete when independent review accepts the fixed contract/transactions/scorer/evidence plan; implementation remains forbidden until root commits the artifacts.

## Actual source preflight adjustment — before any eval generation

The first real conversion attempt rejected source `2660eaff-0365-42c0-afec-d889f7329fb3`
with 409: its persisted kind is `lethal_trifecta`, outside this normal-finding
converter. Before any eval inference, root preserved the original selection and
replaced that source with genuine normal PR5 XSS finding
`f7ebabe0-49cb-4ddb-80bf-9de2598bcd9e`. The final fixed suite remains six positive
and two scope-negative cases, now across **seven** distinct inputs: three prompts
plan **21** calls. No expectations were changed after seeing model output. The
SSRF input also contains an unlabelled metadata defect; this positional scorer
counts unmatched findings as noise, so precision measures agreement with this
curated subset, not semantic truth for every potential vulnerability.
