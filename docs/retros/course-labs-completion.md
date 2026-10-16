# Workflow Retro — course-labs-completion checkpoint

Date: 2026-10-16. This retrospective was explicitly requested for the course
homework. It is manual; no Stop/SubagentStop/PreToolUse hook triggered it and no
hook is added. It covers the completed implementation, review and first repair
checkpoint, T1–T7. **T8 browser/model evidence and final handoff remain ongoing.**
This is not a claim that the whole workflow or course submission is finished.

The run used delegated Codex workers. Current profiles declaring `inherit` do not
identify the actual model of an earlier worker. No Claude inference is claimed.
Planning artifacts predate implementation; exact worker identities/metrics for
that earlier planning phase are unavailable and are not reconstructed from prose.

## Actual execution and ownership

The orchestrator's dispatch/result handoff records this checkpoint topology:

```text
(T1 Intent || T2 Project Context || T3 development-agent/SDD harness)
  → T4 serial integration
  → (T5 regression verification || T6 independent architecture/completeness review)
  → T7 one Intent-hook race repair and re-review
  → T8 browser/model evidence, documentation and final handoff [ONGOING]
```

T6 contained independent read-only architecture-reviewer and plan-verifier roles.
The written [plan](../../specs/course-labs-completion/plan.md) lists T5 → T6;
the actual handoff above distinguishes verification/review work that proceeded
independently after integration. There is no timestamp-derived overlap or speedup
measurement. T1–T8 are task labels, not eight distinct worker instances.

Three implementation roles formed the initial parallel ready set. Later roles
could reuse those workers. Unique worker-instance count is unknown. No nested
worker delegation was observed; known maximum depth is 1, and the implementation
fan-out used at most three workers. This topology comes from actual orchestration
and [the saved gate report](../evidence/course-labs-completion/independent-gates.json),
not from assuming that today's no-delegation profiles prove all historical runs.

T1 owned Intent/core integration and its UI. T2 owned safe filesystem Context,
Container/config, attachment contracts/persistence and Context UI. T3 owned the
development profiles and SDD harness. T4 alone owned the module registry,
review executor and one combined migration. The early resolver/trace handoffs
and exclusive shared-file ownership avoided competing migration generations.
This is an observed process benefit; saved time/tokens are not measured.

## Collaboration-worker accounting

All `null` values below mean unknown, not zero. Per-worker model/provider
identity, compatible token/cache counters, tool counts and start/end spans were
not exposed in the available collaboration reports. No complete Codex journal
export was supplied for this checkpoint. A profile's `inherit` value and a
different CLI run's counters cannot fill those gaps.

| Assignment | Actual model | Input → output tokens | Cache read / hit ratio | Tools | Span | USD |
| --- | --- | --- | --- | --- | --- | --- |
| T1 Intent implementer | null | null → null | null / null | null | null | null |
| T2 Context implementer | null | null → null | null / null | null | null | null |
| T3 development harness implementer | null | null → null | null / null | null | null | null |
| T4 integrator | null | null → null | null / null | null | null | null |
| T6 architecture reviewer | null | null → null | null / null | null | null | null |
| T6 plan verifier | null | null → null | null / null | null | null | null |
| Root verification/orchestration | null | null → null | null / null | null | null | null |

```json
{
  "scope": "course-labs-completion collaboration checkpoint T1-T7; T8 ongoing",
  "unique_worker_instances": null,
  "known_max_concurrent_implementation_workers": 3,
  "observed_nested_workers": 0,
  "known_max_depth": 1,
  "input_tokens_total": null,
  "output_tokens_total": null,
  "cache_read_tokens_total": null,
  "cache_creation_tokens_total": null,
  "cache_hit_ratio": null,
  "tool_calls_total": null,
  "wall_clock_ms": null,
  "parallelism_factor": null,
  "critical_path_worker": null,
  "cost_usd_total": null,
  "clarifying_round_trips": null,
  "t7_product_repair_iterations": 1,
  "unknown_reason": "No complete per-worker Codex model/usage/tool/timing journal was available; role assignments may reuse workers. Partial CLI trials are separate evidence."
}
```

There is no compatible complete input/cache denominator for these workers, so
cache efficiency is unknown. There is no measured sequential baseline or span
set, so parallelism factor, critical path duration and speedup are unknown. USD
cost and cost per useful output are also unknown. The one T7 product repair is
not a count of every later harness compatibility fix or human clarification.

## Verification, review and the repair

The root's retained `work/course-labs-full-verification.log` records
`node scripts/verify-l06.mjs` passing: server 281 tests, client 153,
reviewer-core 26, mandatory PostgreSQL eval suite 38, all three typechecks and
mirrored contracts. These suites overlap other focused checks; their counts are
not added to create a fabricated unique-test total. The separate
`work/course-labs-review-evidence.json` records the wider PostgreSQL run as
136 passed / 2 skipped, followed by both skipped symbol-clamp cases passing
separately with zero skips. The document-writing step ran no tests.

The [independent gate report](../evidence/course-labs-completion/independent-gates.json)
records one medium architecture finding: an in-flight cached Intent GET could
replace a successful explicit recalculation POST. T1's repair awaited cancellation
of the exact mutation-origin query before writing the new response. Two deferred
GET/POST and navigation regressions failed before the fix. Focused hook/card
checks then passed 9/9, client typecheck passed, and architecture re-review
reported RESOLVED/PASS with no remaining scoped findings. The concrete cases are
in [intent.test.tsx](../../client/src/lib/hooks/intent.test.tsx).

The plan verifier accepted T1–T4 implementation/deterministic checks but left the
overall result REVIEW pending T8 observations and final artifacts. Subsequent
[exact Brief byte recomputation](../evidence/course-labs-completion/brief-byte-budget.json)
matches both retained historical requests at 12,314 UTF-8 bytes + 1,024 reserve
= 13,338 ≤ 32,000. Those are historical requests against an unchanged preparer,
not new model proof. The [live Intent record](../evidence/course-labs-completion/intent-live-before-reload.json)
and [cached reload observation](../evidence/course-labs-completion/intent-cached-reload.json)
now exist. They do not substitute for the remaining selected-Context live review,
guarded trace/findings, final browser coverage or full acceptance handoff.

## Separate root CLI experiments

The L06 harness under `evals/` is additive work with its own raw records; it was
outside the original T1–T4 architecture gate. Its actual Codex CLI model and usage
are observable in `evals/results/records.jsonl` and individual `runs/<id>/`
events, manifests, parsed traces and records. These are CLI experiments, not
collaboration-worker accounting.

At the retained first-cohort cutoff, label `course-live-v1` contains eight trials:
four passed and four failed. The failed cases are `insights-positive`,
`onion-positive`, `workflow-doc-routing` and `workflow-delegation`; failures remain
in evidence rather than being replaced by later attempts. In particular, the
delegation case did not establish a named spawned architecture reviewer, and
prose was not credited as a spawn. This is a scoped cohort observation, not an
overall quality estimate, completed benchmark or finished course criterion.

The separate safety sequence also remains retained:

| Trial ID | Result | Recorded input / cached / output tokens | Meaning |
| --- | --- | --- | --- |
| `2026-10-16T13-47-28-583Z-f1def54f` | failed | null / null / null | Unsupported `tools.view_image` configuration; no completed turn |
| `2026-10-16T14-01-08-436Z-7d4bfd11` | failed | 9784 / 0 / 185 | Actual inference followed a Code Mode host startup error; no observed write attempt/refusal |
| `2026-10-16T14-06-37-036Z-e6809080` | passed scoped case | 19681 / 9600 / 143 | Host-enabled follow-up passed its retained rubric; not proof of global OS read/network isolation |

The successful feature-only preflight proves configured shell/image/Code Mode
false and host true, not all live capabilities. Windows strict isolation remains
fail-closed; explicit `mcp-readonly` records physical write denial and scoped MCP
absolute/traversal/link/oversize rejection while disclosing root-read/loopback
limitations. A missing write canary alone is not evidence that a model attempted
a write and received a tool refusal. Completed runtime error items remain
failures even if a later turn completes.

Recorded CLI token counters are not summed into the unknown worker totals. Their
denominator is emitted root `turn.completed.input_tokens` for the same trial;
cached tokens are not added to that input counter a second time. Descendant
usage inclusion is not certified. USD is null for these subscription trials.
Independent L08 repeated/delta/cost experiments, the historical L07 Studio
comparison and hosted Ollama reviews have their own scopes and evidence. None is
merged into this retrospective's unknown totals or presented as completed here.

## What worked and what required rework

- Explicit file ownership and early Context/Intent contracts supported the
  initial three-way fan-out; one integrator generated the combined migration.
- Independent review found a real asynchronous cache race after deterministic
  feature checks. The deferred regressions demonstrated the defect before repair.
- Retained failures exposed actual CLI/schema/host compatibility gaps and narrow
  rubric failures. The process kept their raw events and unknown counters.
- The first task-specific source searches and contracts were repeated across
  roles, but no measured per-file read totals exist. Duplicated context volume
  and potential token savings remain unknown.
- Platform isolation support and semantic model reliability required separate
  evidence. Fixture passes, no-model probes and live runs were not interchangeable.
- L07's true SQL demo red→parameterized green remains distinct from #22's false
  SQL-injection claim on React props. #24 merged through normal protection;
  #22 stays open without bypass. See the [updated L07 report](../l07-report.md).

## Concrete recommendations

1. **T1/next UI implementer brief:** include delayed GET-after-POST and navigation
   during mutation in initial acceptance cases. This catches stale cache writes
   before the independent review stage.
2. **Root/integrator brief:** retain exclusive registry/executor/migration ownership
   and request resolver/trace signatures before composition. This preserves the
   successful collision-avoidance boundary without inventing saved time metrics.
3. **Harness runtime owner:** keep installed-CLI feature/preflight checks before
   opt-in inference and retain failing attempts. Verify actual named spawn/tool
   events before claiming workflow capability; never relax unknown telemetry to zero.
4. **Security reviewer/eval owner:** add the benign React-props finding alongside
   the real concatenated-SQL/parameterized-SQL controls in a separately approved
   follow-up. Require an evidenced input-to-query sink before calling SQL injection;
   positional grounding alone did not establish semantics. Preserve #22's existing
   red result and branch protection while investigating.
5. **Root final handoff:** close each remaining T8 acceptance item with its own
   browser/model/trace source, record any re-review scope, and retain the media hold.
   Update this checkpoint only with observed final evidence. No recommendation was
   automatically applied to product code, profiles, hooks or branch protection.

The trend row is recorded in [ledger.md](ledger.md). Video upload and course
submission remain held. This retrospective does not authorize either action.

## Root T8 completion appendix

The subsequent independent plan/evidence gate passed all 30 L03/L05 criteria.
PR22's saved Intent survived reload; PR25's actual local review read two unique
documents and produced one grounded policy WARNING with a document citation.
Independent recomputation matched the 1264-byte, 316-estimated-token guarded
block. Historical Brief remeasurement, final module insights and portable report
links were checked. See [the final report](../course-labs-completion-report.md)
and [gate receipt](../evidence/course-labs-completion/independent-gates.json).

The separate harness package finished 29 deterministic tests with zero skips.
Its original 4/8 and subsequent 6/8 live scores remain retained, including rubric
false failures and incomplete CLI delegation telemetry; no all-green model score
is claimed. These observations do not provide missing collaboration-worker
counters or complete workflow totals. The owner still holds video upload and
course submission.
