# server architecture

TypeScript ESM, Fastify, Drizzle ORM, PostgreSQL with pgvector, Zod, Octokit and reviewer-core.

Routes validate requests and obtain workspace context. Services coordinate domain operations through platform/container.ts; repositories scope DB reads/writes to the workspace. Provider/GitHub/Git adapters sit at the outer boundary. ReviewRunExecutor owns I/O; reviewer-core owns prompt/grounding logic.

## Runtime and checks

`pnpm db:migrate; pnpm db:seed; pnpm dev; pnpm typecheck; pnpm exec vitest run --exclude "**/*.it.test.ts"`. There is no separate lint script in this package; typechecking is the configured static check.

## Boundaries

Generated migrations and lockfiles must not change as a side effect of unrelated work. Keep credentials, local runtime files and .env out of commits.
