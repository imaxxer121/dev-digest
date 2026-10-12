# reviewer-core guide

## Stack and role

TypeScript ESM, Zod, OpenAI-compatible adapters and Vitest.

The pure pipeline accepts an injected LLMProvider and supplied diff/context. Prompt assembly, structured output, grounding and reduction have no database, filesystem or GitHub dependencies. Server imports source via its tsconfig alias. Keep adapters behind interfaces; never introduce platform secrets or DB calls here.

## Commands

`npm ci; npm test; npm run typecheck`. No separate lint script is configured.

## Naming conventions

Use existing folder conventions, PascalCase React components, camelCase variables and .test.ts/.test.tsx for unit tests. Server tests requiring PostgreSQL use .it.test.ts. Use Node dirname/pathToFileURL helpers for OS paths.

## Do not touch

Do not edit generated migration history or lockfiles for an unrelated feature. Add a new migration when a schema feature requires it. Never commit keys, .env or runtime artifacts.

## Read When

- Before changing package boundaries or setup, read docs/architecture.md.
- Before changing review behavior, read specs/review-contract.md.
- Before coding, read INSIGHTS.md; after validation apply ../.claude/skills/engineering-insights/SKILL.md.
