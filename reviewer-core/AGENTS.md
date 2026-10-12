# reviewer-core guide

## Stack and role

TypeScript ESM, Zod, OpenAI-compatible adapters and Vitest.

The pure pipeline accepts an injected LLMProvider and supplied diff/context. Prompt assembly, structured output, grounding and reduction have no database, filesystem or GitHub dependencies. Server imports source via its tsconfig alias. Keep adapters behind interfaces; never introduce platform secrets or DB calls here.

## Commands

`npm ci; npm test; npm run typecheck`. No separate lint script is configured.

## Naming conventions

Use camelCase for pure functions and PascalCase for types and schemas. Keep
review, prompt, grounding and output helpers in their existing folders. Unit
tests use .test.ts with injected providers and fixed diffs; they make no model
requests. Keep wire field names compatible with the vendored shared contracts.

## Do not touch

Do not edit generated migration history or lockfiles for an unrelated feature. Add a new migration when a schema feature requires it. Never commit keys, .env or runtime artifacts.

## Read When

- Before changing package boundaries or setup, read docs/architecture.md.
- Before changing review behavior, read specs/review-contract.md.
- Before coding, read INSIGHTS.md; after validation apply ../.claude/skills/engineering-insights/SKILL.md.

Apply frontend-architecture to client changes, onion-architecture to server changes, and pr-self-review to mixed diffs. Capture verified notes using engineering-insights after validation.
