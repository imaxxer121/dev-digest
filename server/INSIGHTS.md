# Server engineering insights

## 2026-10-12 — CLI entry-point checks must convert Windows paths

Comparing `import.meta.url` with a string built as `file://${process.argv[1]}`
silently skipped migration and seed execution on Windows. Compare it with
`pathToFileURL(resolve(process.argv[1])).href`, guarded for a missing argument.
Evidence: `src/db/migrate.ts:37` and `src/db/seed.ts:229`. After the fix, migration
and seed completed and the local seeded PR appeared in the browser.

Test fixture parents also need `dirname(full)` rather than slash-only splitting
(`test/indexer-pipeline.test.ts:142`). The server unit suite passed 101 tests
with `node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'`;
TypeScript checking passed. DB integration tests were not run.
