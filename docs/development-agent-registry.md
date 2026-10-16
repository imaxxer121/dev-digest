# Development agent registry

The eleven `.claude/agents/` profiles are local development roles. They do not
create or modify the product's database-backed review agents. Product reviewer
prompts remain documented in [agent-prompts/README.md](agent-prompts/README.md).

| Agent | Boundary | Handoff |
| --- | --- | --- |
| [researcher](../.claude/agents/researcher.md) | Read/search only; no writes, shell or delegation. | Source findings and gaps to the requesting orchestrator. |
| [planner](../.claude/agents/planner.md) | Original L03 read-only planning role; no writes, shell or delegation. | Proposed steps/DAG/checks in its response. |
| [implementer](../.claude/agents/implementer.md) | Writes only one dispatched task's owned product/test paths; scoped local checks. | Changed paths, AC evidence, integration needs and failures. |
| [test-writer](../.claude/agents/test-writer.md) | Writes only dispatched tests/fixtures; never production fixes. | Test evidence and production defects; separate explicit tasks only. |
| [architecture-reviewer](../.claude/agents/architecture-reviewer.md) | Independent read-only structural/boundary review; no shell or delegation. | Evidence, severities and PASS/FAIL/REVIEW gate to orchestrator. |
| [security-reviewer](../.claude/agents/security-reviewer.md) | Independent read-only ownership, traversal, injection and exposure review. | Evidence and recommendations; never fixes. |
| [plan-verifier](../.claude/agents/plan-verifier.md) | Independent read-only AC/task traceability; consumes actual check output. | Complete matrix, evidence gaps and gate to orchestrator. |
| [doc-writer](../.claude/agents/doc-writer.md) | Writes only dispatched documentation; no shell or product changes. | Grounded docs, source references and unresolved gaps. |
| [brainstorm](../.claude/agents/brainstorm.md) | Read-only alternatives/tradeoffs; no persistent changes or delegation. | Options and assumptions before requirements/implementation. |
| [spec-creator](../.claude/agents/spec-creator.md) | Writes only one designated `specs/` specification artifact. | WHAT/WHY, six clarification categories and EARS AC IDs. |
| [implementation-planner](../.claude/agents/implementation-planner.md) | Writes only one designated plan; requirements remain read-only. | HOW, AC refs, owned paths, DAG, mode, checks and risks. |

`planner` retains the L03 read-only contract. `implementation-planner` is the
separate L05 SDD artifact author; its write permission does not apply to planner.
SDD proceeds `spec-creator → implementation-planner → run-plan → plan-verifier`.
Use [run-plan](../.claude/skills/run-plan/SKILL.md) only once an agreed plan exists.
It dispatches implementers by the plan DAG, then independent architecture and
completeness reviewers in parallel. Its default repair cap is three, with an
earlier no-progress exit. Implementers write their own task tests; run-plan does
not spawn test-writer. A dedicated security review is available when requested;
architecture review still checks touched security boundaries.

## Runtime and permission mapping

All profiles use `model: inherit`, a supported file-agent setting that uses the
calling session's configured model. In this Codex adaptation the orchestrator reads
the selected profile and passes its role, allowed operations and owned paths in
the dispatch. It uses available Codex delegation tools and inherits the active
session model; these files do not select Sonnet/Opus or establish that either ran.
Do not override the inherited model without an explicit applicable instruction.
If the runtime does not expose the actual model identity, report it as unknown.

`Read`, `Glob`, `Grep`, `Write`, `Edit` and `Bash` are file-agent capability labels,
not promises that similarly named Codex tools exist. Map read/search to the
available bounded read/search operations, edits to the scoped file-edit tools and
local verification to the available shell. A read-only role gets read/search
operations only: no Write/Edit, unrestricted shell, network mutations or delegated
writers. Plan-verifier deliberately has no shell; the orchestrator supplies saved
command evidence or executes a separately scoped check. Tests and typechecks can
write caches even if they sound observational. Do not grant them implicitly.

These profiles are dispatch contracts, not an independently installed Codex
sandbox. The consuming harness must enforce the tool allowlist where supported;
the orchestrator must preserve the restriction when mapping tools. Do not claim
metadata alone prevents every possible runtime operation. No profile has Agent or
Task permission, and none may spawn nested agents. All writing roles stay inside
their designated artifact/task ownership. Scope conflicts return to orchestrator.

The `skills` metadata lists existing local skills. Read relevant SKILL.md bodies
explicitly unless the actual runtime confirms loading them. A skill's general
advice never widens the profile's role or write scope. Keep commits, remote writes,
live model calls and course uploads/submission outside these task permissions.

## Evidence and validation

Run `node scripts/check-development-agents.mjs`. It validates required unique names,
the constrained YAML frontmatter, model/tool/skill metadata, local references,
read-only allowlists and required workflow boundaries. It is a static policy check;
it does not prove a runtime used a profile or that product acceptance criteria pass.

Use `node scripts/check-development-agents.mjs --dry-run-plan
specs/course-labs-completion/plan.md` for the initial dependency/owned-path audit.
The dry run launches no agents, changes no files and executes no product checks.
Expand prose path shorthand before an actual dispatch and preserve serial ownership
for shared files throughout execution.

After a separately requested retrospective, retain
[workflow-retro](../.claude/skills/workflow-retro/SKILL.md). Record topology including
any actually observed nested agents, actual launch order/models, source references,
tool counts, input/output/cache tokens, duration and nullable cost. Missing counters
are unknown/null with a reason; estimates are separately labeled. Calculate a cache
ratio only from compatible measured counters and name its denominator. A profile
default or a fixture pass is not evidence of model execution or billed cost.
