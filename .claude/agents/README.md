# Development agents

These eleven file agents support development of DevDigest. They are separate from
the product's database-backed PR review agents documented in
[`docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md).

The [development registry](../../docs/development-agent-registry.md) lists every
role, permission boundary and handoff. All profiles use `model: inherit`; current
Codex sessions inherit their configured model rather than selecting an upstream
Claude model. Model names and resource measurements belong in observed run evidence.

| Profile | Handoff |
| --- | --- |
| [researcher](researcher.md) | Read-only source findings and gaps. |
| [planner](planner.md) | Read-only L03 proposal, dependencies and checks. |
| [implementer](implementer.md) | One owned task, tests and observed verification. |
| [test-writer](test-writer.md) | Owned tests/fixtures from a separate explicit dispatch. |
| [architecture-reviewer](architecture-reviewer.md) | Independent read-only structural gate. |
| [security-reviewer](security-reviewer.md) | Independent read-only security findings. |
| [plan-verifier](plan-verifier.md) | Independent read-only AC/evidence matrix and gate. |
| [doc-writer](doc-writer.md) | Owned documentation grounded in source/results. |
| [brainstorm](brainstorm.md) | Read-only alternatives, tradeoffs and assumptions. |
| [spec-creator](spec-creator.md) | One designated EARS specification artifact. |
| [implementation-planner](implementation-planner.md) | One designated plan with ACs, ownership and DAG. |

Run `node scripts/check-development-agents.mjs` from the repository root to check
the eleven profiles, local skill references, registry and read-only allowlists.
The files define roles and dispatch contracts; they do not themselves install a
Codex tool sandbox or run any agent.
