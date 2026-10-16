# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | Existing UI architecture, component and data boundaries |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Thin routes, service/repository and adapter boundaries |
| [pr-self-review](pr-self-review/SKILL.md) | Development | Manual scoped diff review with stack skills and a second pass after fixes; no Git hooks |
| [engineering-insights](engineering-insights/SKILL.md) | Development | Record verified source/check discoveries inside assigned note ownership |
| [run-plan](run-plan/SKILL.md) | Development | Existing-plan DAG execution, independent gates and bounded repairs; no remote writes |
| [workflow-retro](workflow-retro/SKILL.md) | Development | Explicitly requested retrospective with sourced metrics and unknown counters |

## Development workflow

The [eleven-role registry](../../docs/development-agent-registry.md) covers
researcher, planner, implementer, test-writer, architecture-reviewer,
security-reviewer, plan-verifier, doc-writer, brainstorm, spec-creator and
implementation-planner. The L03 planner stays read-only. The separate L05 chain is
`spec-creator → implementation-planner → run-plan → plan-verifier`; artifact
writers each own only their designated spec or plan. Run-plan uses inherited
session models, honors existing authorization, does not spawn test-writer and
makes no commits or remote writes. Workflow-retro remains a separate explicit
invocation. Validate metadata/references with
`node scripts/check-development-agents.mjs`.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Scoped roles | Via the active runtime's delegation tools | Development role and permission contracts |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
