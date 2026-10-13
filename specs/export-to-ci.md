# Export to CI

Status: planned before implementation, 2026-10-13.

## User stories and acceptance

1. Agent Add to CI opens Target → Preview → Configure → Install. Only GitHub
   Actions is offered. Preview includes validated agent YAML, linked skills,
   exported memory, bundled runner and editable workflow. Configure opened /
   synchronize / optional reopened events, review/comment/exit-only publication
   and deterministic Fail CI on severity. Export via installation PR devdigest/ci
   or real ZIP download; never write directly to the default branch.
2. Studio and bundled runner consume the same AgentManifest Zod schema. Export
   rejects unsupported providers/configuration instead of silently changing models.
   A CI-only explicit Ollama runtime/model override is available for subscription
   Codex agents: user sees the changed inference model before export. Hosted runners
   never receive local Codex login credentials. OpenRouter remains supported using
   an Actions secret; this account currently has no external API key.
3. The runner reuses reviewer-core prompt guarding and citation grounding. Gate and
   review event derive from grounded findings. Real tokens and duration are captured;
   unavailable dollar cost remains null. Artifact contains originals, attribution,
   manifest digest/version, provider/model, runner/dependency version, repo numeric
   ID, PR, exact fetched head SHA and job identity. No keys, environment dumps or
   unrelated local data may appear in artifact/logs.
4. Generated workflow executes only checked-in trusted base runner/configuration,
   treats PR diff/body as data, pins external actions by commit SHA, and gives only
   contents:read plus pull-requests:write when posting. Forks get no paid secrets or
   write-capable review job. No pull_request_target plus untrusted checkout/code,
   no PR-controlled shell interpolation. Ollama runs on loopback in the temporary
   hosted runner, with pinned official binary/version verification and bounded time.
5. CI Runs and Agent CI show repo, PR, agent, verdict, findings, actual duration,
   cost availability, workflow version and job link. Refresh uses authenticated
   GitHub artifact retrieval; verifies repository ID, workflow/run/commit/artifact
   provenance and schema before idempotently ingesting source=ci agent_runs/trace.
   Client-supplied JSON alone is not an authenticated ingestion channel.
6. Deterministic tests cover generation, providers, grounding/gate parity, path
   safety, artifact provenance, idempotency and workspace scoping. Real hosted CI
   demo reviews a same-repository PR, publishes the result, uploads the artifact,
   and ingests it. Critical findings fail the job; configure an actual required
   check on the demo integration branch so GitHub visibly blocks its merge.

## Ownership and merge order

Worktree B: feat/l07-export-to-ci. Owns server/src/modules/ci, ci schema/additive
migration, eval-ci.ts mirrored copies, agent-runner additions, client CI screens,
Agent CI/export components/hooks and CI-specific messages. Existing review-api.ts
is A-owned; consume original FindingRecord shape without editing that file.
Root owns shared integration files, lockstep migration ordering and publication.
A merges first, B updates/rechecks second. Worktree apps/DBs remain independent.

## Verification

agent-runner pnpm typecheck/test/build, runner bundle smoke check; server pnpm
typecheck plus CI unit and isolated PostgreSQL tests; client pnpm typecheck plus
interaction tests; schema copy parity; production build after integration. Record
real model/CI runs separately from mocked tests. No claimed inference, required
gate or export installation until observed. Capture development overlap, conflict
resolution and review durations in docs/retros/ledger.md; unknown coding-token or
human-review totals remain explicitly unavailable.
