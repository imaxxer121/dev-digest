# server guide

## Stack and role

TypeScript ESM, Fastify, Drizzle ORM, PostgreSQL with pgvector, Zod, Octokit and reviewer-core.

Routes validate requests and obtain workspace context. Services coordinate domain operations through platform/container.ts; repositories scope DB reads/writes to the workspace. Provider/GitHub/Git adapters sit at the outer boundary. ReviewRunExecutor owns I/O; reviewer-core owns prompt/grounding logic.

## Commands

`pnpm db:migrate; pnpm db:seed; pnpm dev; pnpm typecheck; pnpm exec vitest run --exclude "**/*.it.test.ts"`. No separate lint script is configured.

## Naming conventions

Use existing folder conventions, PascalCase React components, camelCase variables and .test.ts/.test.tsx for unit tests. Server tests requiring PostgreSQL use .it.test.ts. Use Node dirname/pathToFileURL helpers for OS paths.

## Do not touch

Do not edit generated migration history or lockfiles for an unrelated feature. Add a new migration when a schema feature requires it. Never commit keys, .env or runtime artifacts.

## Read When

- Before changing package boundaries or setup, read docs/architecture.md.
- Before changing review behavior, read specs/review-contract.md.
- Before coding, read INSIGHTS.md; after validation apply ../.claude/skills/engineering-insights/SKILL.md.
