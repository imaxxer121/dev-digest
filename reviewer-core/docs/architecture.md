# reviewer-core architecture

TypeScript ESM, Zod, OpenAI-compatible adapters and Vitest.

The pure pipeline accepts an injected LLMProvider and supplied diff/context. Prompt assembly, structured output, grounding and reduction have no database, filesystem or GitHub dependencies. Server imports source via its tsconfig alias. Keep adapters behind interfaces; never introduce platform secrets or DB calls here.

## Runtime and checks

`npm ci; npm test; npm run typecheck`. There is no separate lint script in this package; typechecking is the configured static check.

## Boundaries

Generated migrations and lockfiles must not change as a side effect of unrelated work. Keep credentials, local runtime files and .env out of commits.
