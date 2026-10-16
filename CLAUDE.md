@AGENTS.md

# Read When

Before server boundary or API changes, read `server/AGENTS.md`,
`server/docs/architecture.md` and `server/specs/review-contract.md`.
Before review pipeline, prompt or grounding changes, also read
`reviewer-core/AGENTS.md`, `reviewer-core/docs/architecture.md` and
`reviewer-core/specs/review-contract.md`. Before client changes, read
`client/AGENTS.md` and `client/docs/architecture.md`. Read affected package
`INSIGHTS.md` before coding. Do not invent missing documentation paths.

For development-agent roles and SDD handoffs, read
`docs/development-agent-registry.md` and the applicable `.claude/agents/` and
`.claude/skills/` bodies. Role names describe responsibilities; record the actual
runtime/model rather than claiming Claude ran from this filename.

# Two different eval systems

The product eval module (`server/src/modules/evals`, Agent Evals UI and
`pnpm verify:l06`) evaluates saved PR review findings and frozen product cases.
Keep its grounding, workspace scoping and PostgreSQL gates intact.

The self-contained `evals/` package evaluates this development harness: Skill
activation/content, agent review behavior, documentation routing and observable
delegation. From `evals/`, install with `npm ci`, then use these **no-model** gates:

- `npm run eval:quality`: artifact frontmatter, links, cases and source readiness.
- `npm run eval:skills`: deterministic activation/control/scoring checks.
- `npm run eval:agents`: deterministic agent rubric and source-snapshot checks.
- `npm run eval:workflow`: runtime safety, JSON telemetry and reporting checks.

`npm test` runs every deterministic harness test. These checks do not prove
model behavior. Real Codex subscription trials require explicit `EVAL_LIVE=1`,
`EVAL_MODEL`, a native `CODEX_CLI_PATH` when it is absent from PATH, and the
bounded `eval:live`, `eval:repeat` or `eval:benchmark` command described in
`evals/README.md`. Never infer on reads or default CI; never use API keys,
unrestricted approvals, or convert missing telemetry/auth into a passing trial.
