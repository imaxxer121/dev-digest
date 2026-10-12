# Client notes

PR findings are grouped by persisted review run in `FindingsTab`.
`ReviewRunAccordion` owns expansion; `FindingsPanel` owns confidence filtering,
sorting and finding actions. Keep the PR severity selection above these panels
so it applies to every run. Counters use the complete persisted findings list.

Run `pnpm typecheck` and `pnpm test`. Component tests use jsdom and mocked
external hooks, while the local seeded PR supports browser checks without keys.
Import UI primitives through `@devdigest/ui`; reuse CSS theme variables.
