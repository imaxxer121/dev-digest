# client guide

## Stack and role

Next.js App Router, TypeScript, React 19, TanStack Query, next-intl, Zod and @devdigest/ui.

Route pages own data fetching and navigation. Put page-specific components under _components/<PascalCase>/ with index.ts exports; shared components live under src/components/. Query hooks live in src/lib/hooks/. UI copy belongs in messages/en/. Vendored shared DTOs must match server copies.

## Commands

`pnpm dev; pnpm typecheck; pnpm test`. No separate lint script is configured.

## Naming conventions

Use existing folder conventions, PascalCase React components, camelCase variables and .test.ts/.test.tsx for unit tests. Server tests requiring PostgreSQL use .it.test.ts. Use Node dirname/pathToFileURL helpers for OS paths.

## Do not touch

Do not edit generated migration history or lockfiles for an unrelated feature. Add a new migration when a schema feature requires it. Never commit keys, .env or runtime artifacts.

## Read When

- Before changing package boundaries or setup, read docs/architecture.md.
- Before changing review behavior, read specs/review-contract.md.
- Before coding, read INSIGHTS.md; after validation apply ../.claude/skills/engineering-insights/SKILL.md.
