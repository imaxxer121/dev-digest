---
name: run-plan
description: "Execute an existing agreed plan by its dependency DAG and owned paths, then independent read-only gates and a bounded repair loop; no commits or remote writes."
---

# Run Plan

Consume an existing agreed specification and implementation plan. Spec authoring
and planning happen separately through spec-creator and implementation-planner.
Run-plan does not create or rewrite either artifact. Existing user/session
authorization supplies execution mode and scope; do not repeat answered questions
or introduce another approval gate. If a required input or consequential decision
is truly missing, request it while continuing independent authorized work.

## Inputs and prerequisites

- `plan:<path>`: required existing readable plan, or an unambiguous existing plan
  identified in the current request. Read its referenced agreed spec.
- `mode:multi` / `mode:single`: explicit session override, otherwise plan mode.
- `max-fix:<n>`: integer 0–3; default maximum three repair iterations. An authorized
  smaller limit wins. Reject an invalid/larger value instead of silently looping.
- Existing constraints, holds, baseline/revision and other tasks' ownership.

Read applicable AGENTS.md and the [development registry](../../../docs/development-agent-registry.md).
Load role profiles and relevant real skill bodies; do not assume metadata injected
them. In Codex, dispatch with available session delegation and inherit its configured
model. Record actual model identity only when observable; otherwise unknown.
Do not claim an upstream Sonnet/Opus model ran because a template used that label.

## Permission boundaries

- No commits, pushes, merges, PR creation, publishing, uploads, deployment, external
  messages or other remote writes. Workers make no live/paid model calls. Any
  root-owned live-model evidence needs separate explicit session authorization,
  an assigned plan step and actual call/usage recording; execution of a plan alone
  does not grant that authorization.
- No test-writer: do not spawn test-writer. Implementers write meaningful tests
  required by their tasks and self-verify with relevant existing suites/typechecks.
- Root coordinates. Workers cannot delegate or spawn nested agents. Maximum three
  concurrent implementers, or a lower available/session limit; count the root
  against runtime slots. Do not exceed the runtime's actual capacity.
- Concurrent tasks must have non-overlapping owned paths. Return unassigned work
  to root; serialize and explicitly reassign shared files. Read-only reviewers
  receive no Write/Edit, unrestricted shell or delegated writers.
- Keep failed checks and unresolved ACs visible. A skipped or unavailable required
  check is not a pass. Fixtures do not establish live/browser/model evidence.

## Execute the DAG

1. Extract task IDs, action, owner/type/module, AC references, skill names, exact
   owned paths, prerequisites, gotchas, checks and evidence requirements. Expand
   prose shorthand and braces before dispatch. Validate missing task IDs, cycles
   and every concurrent ownership intersection. Record the actual baseline and
   initial dirty files so another worker's changes are not attributed to this run.
2. In multi mode, choose the ready set: prerequisites successfully complete and
   ownership disjoint from all active tasks. Dispatch at most three implementers
   using each full task plus all other active ownership lists. Never start a
   dependent task merely because its prerequisite returned a partial report.
3. In single mode, use one implementer at a time in topological order. It remains
   subject to task ownership and checks. Mode changes scheduling, not acceptance.
4. Collect concise reports with changed paths, exact commands/results, AC coverage,
   integration signatures and gaps. Mark complete only on evidence sufficient for
   dependents. Handle out-of-scope fixes through explicit serial reassignment.
   Continue independent ready tasks while a different branch is blocked. Record
   failure/partial status honestly rather than skipping a red dependency.
5. Repeat until implementation/integration and the plan's verification prerequisites
   are complete or blocked. Keep required root evidence tasks with the root;
   implementation permission does not authorize remote/model/browser actions that
   require separate session authorization. No task can silently widen this skill.

## Independent gates

Accumulate the exact changed-file set from the captured baseline, final working
diff including untracked task files, and owner reports. Do not assume origin/main
is the right base. Supply both reviewers with the same spec, plan, changed set,
baseline, owner reports, actual check evidence and known limits.

Dispatch architecture-reviewer and plan-verifier concurrently as independent
read-only agents. Architecture review checks structural and security boundaries;
plan-verifier maps every AC/task to source and observed evidence. They do not
implement, fix, run mutating checks or read each other's unfinished conclusions.
Collect both PASS/FAIL/REVIEW verdicts. If runtime capacity prevents concurrency,
record that actual limitation and preserve independent reviews.

## Bounded repairs

Build a backlog from architecture critical/high findings and verifier missing/
partial criteria. Keep cannot-verify and medium/low findings disclosed; unresolved
required evidence still prevents claiming complete success.

For at most `max-fix` iterations (default 3): group findings into explicit
non-overlapping owned subsets, dispatch implementers with the evidence and affected
ACs, rerun relevant checks, then repeat both independent gates on changed files
and affected criteria. Serialize shared paths and retain the maximum three-worker
limit. Compare the concrete unresolved backlog and check results after each round.
Stop early on no progress: the same unresolved findings with no new satisfying
evidence. Do not retry indefinitely or relabel missing evidence as implemented.

At the cap, no-progress exit, blocked dependency or failed gate, return remaining
findings/ACs with reasons and the next bounded action. Never mark them passed.

## Result and later handoff

Return plan/spec paths, mode, baseline/revision, actual topology and launch order,
task/changed-path summary, exact verification results, both gates, repair rounds,
all remaining ACs/findings and known limits. Include actual models, tool counts,
tokens/cache, time and nullable cost only if a source provides them. Otherwise
unknown/null plus the missing source; estimates need their own label/method.

Run the separately authorized manual
[pr-self-review](../pr-self-review/SKILL.md) on the final mixed diff, including its
second uncommitted pass after the last fixes. It does not publish either.
[workflow-retro](../workflow-retro/SKILL.md) remains available when explicitly
requested in the session; never auto-trigger it, install hooks or write its ledger
without that request. Any later publication or course submission is outside
run-plan and preserves the user's existing holds.
