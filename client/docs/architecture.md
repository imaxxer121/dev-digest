# client architecture

Next.js App Router, TypeScript, React 19, TanStack Query, next-intl, Zod and @devdigest/ui.

Route pages own data fetching and navigation. Put page-specific components under _components/<PascalCase>/ with index.ts exports; shared components live under src/components/. Query hooks live in src/lib/hooks/. UI copy belongs in messages/en/. Vendored shared DTOs must match server copies.

## Runtime and checks

`pnpm dev; pnpm typecheck; pnpm test`. There is no separate lint script in this package; typechecking is the configured static check.

## Boundaries

Generated migrations and lockfiles must not change as a side effect of unrelated work. Keep credentials, local runtime files and .env out of commits.
