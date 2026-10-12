# e2e guide

## Stack and role

TypeScript ESM, tsx, Node.js and agent-browser CDP command-line journeys.

run.ts dispatches deterministic journeys against a seeded local API and UI. Fixtures isolate browser checks from model access. The official Unix hermetic launcher lives in scripts/e2e.sh. On Windows use running local services and CUA for recorded browser verification. Do not claim an unavailable Unix/CDP runner passed.

## Commands

`npm ci; npm run typecheck; npm test (requires supported agent-browser/runtime); npm run e2e:hermetic (Unix + Docker)`. No separate lint script is configured.

## Naming conventions

Use existing folder conventions, PascalCase React components, camelCase variables and .test.ts/.test.tsx for unit tests. Server tests requiring PostgreSQL use .it.test.ts. Use Node dirname/pathToFileURL helpers for OS paths.

## Do not touch

Do not edit generated migration history or lockfiles for an unrelated feature. Add a new migration when a schema feature requires it. Never commit keys, .env or runtime artifacts.

## Read When

- Before changing package boundaries or setup, read docs/architecture.md.
- Before changing review behavior, read specs/review-contract.md.
- Before coding, read INSIGHTS.md; after validation apply ../.claude/skills/engineering-insights/SKILL.md.
