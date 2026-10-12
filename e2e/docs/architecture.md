# e2e architecture

TypeScript ESM, tsx, Node.js and agent-browser CDP command-line journeys.

run.ts dispatches deterministic journeys against a seeded local API and UI. Fixtures isolate browser checks from model access. The official Unix hermetic launcher lives in scripts/e2e.sh. On Windows use running local services and CUA for recorded browser verification. Do not claim an unavailable Unix/CDP runner passed.

## Runtime and checks

`npm ci; npm run typecheck; npm test (requires supported agent-browser/runtime); npm run e2e:hermetic (Unix + Docker)`. There is no separate lint script in this package; typechecking is the configured static check.

## Boundaries

Generated migrations and lockfiles must not change as a side effect of unrelated work. Keep credentials, local runtime files and .env out of commits.
