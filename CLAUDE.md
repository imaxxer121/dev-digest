# DevDigest project guide

DevDigest is a local PR review studio. The workflow is GitHub import → stored
diff → reviewer-core prompt and grounding → persisted reviews → client findings.

## Packages

- `client/`: Next.js App Router, React, TanStack Query and next-intl; port 3000.
- `server/`: Fastify, Drizzle and PostgreSQL with pgvector; port 3001.
- `reviewer-core/`: review pipeline with an injected LLM provider.
- `e2e/`: deterministic browser journeys over seeded data.

These are independent packages. Install server/client with pnpm and reviewer-core
with `npm ci`. There is no root package or shared workspace lockfile.

## Run and validate

On a Unix shell, `./scripts/dev.sh` starts the database, migrations, seed and apps.
From PowerShell, run Docker Compose first, then the package scripts separately.

- Server: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, `pnpm typecheck`.
- Client: `pnpm dev`, `pnpm typecheck`, `pnpm test`.
- Server unit tests: `pnpm exec vitest run --exclude '**/*.it.test.ts'`.
- DB integration tests: `pnpm exec vitest run .it.test` (requires Docker).
- Reviewer-core: `npm test`.

## Conventions

Keep feature components in their existing `_components/<Component>/` folders.
Use `@devdigest/ui` and theme variables. Put translated UI copy in
`client/messages/<locale>/`. Shared Zod contracts are vendored in client and
server: changing a contract requires checking both copies and all consumers.
Use Node path/url helpers for OS paths; use POSIX paths only for GitHub URLs.

Do not edit generated migrations or lockfiles as a side effect of a UI feature.
Keep keys, local runtime files and `.env` out of commits. Tests use mocks or
seeded data; paid model calls are a separate explicit action.

## Session notes

After a coding task, use `.claude/skills/engineering-insights/SKILL.md` to record
the useful verified discoveries in the affected module's `INSIGHTS.md`.
Read existing module notes before changing the corresponding code.
See `docs/review-workflow.md` and `specs/l01-severity-findings.md` for L01.
