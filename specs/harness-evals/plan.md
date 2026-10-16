# L06 harness eval plan

1. Read AGENTS/CLAUDE, existing product evals and extracted upstream template at
   ../course-upstream-templates/l06/evals. Adapt reusable structure without merging
   unrelated upstream source (AC-E01,E07).
2. Implement bounded Codex runtime, raw JSON trace parser and explicit live gate;
   use existing signed-in CLI in its own auth environment, never copy credentials
   into fixtures/reports. Runtime sandbox read-only; restrict environment and
   tools appropriately, preserve actual error/unknown states (AC-E02..04,E08).
3. Add actual repository-specific cases plus deterministic validator/parser tests.
   Separate packaging quality from behavioral live proof (AC-E01,E03,E05).
4. Add static CI and manually invoked model reporting with safe no-auth skip/error
   outcome; document local subscribed CLI prerequisite and commands (AC-E06..08).
5. Owner checks deterministic tests/typecheck/quality; root owns real model runs,
   final integrated review and publication. No model calls from delegated worker.

Owner: completion_context. Exact owned paths: evals/**, .github/workflows/eval-skills.yml,
.github/workflows/eval-agents.yml, .github/workflows/eval-workflow.yml, CLAUDE.md.
No product code, shared schemas, migration, other CI or package/root lock changes.
No commits, remote writes, nested agents or video uploads. Return actual command
results and any unknown/blocked model criteria to root, not a synthetic pass.
