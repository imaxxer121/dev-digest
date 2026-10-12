# Server notes

`src/modules/pulls/routes.ts` imports PR data; the review service and executor
under `src/modules/reviews/` gather context, call reviewer-core and persist
findings. `src/db/migrate.ts` and `seed.ts` are explicit CLI entry points.

Run `pnpm typecheck` and the unit suite before changing server behavior.
`*.it.test.ts` files are the DB-backed lane and require Docker.
Use `pathToFileURL` to compare CLI entry points and `dirname` for OS paths.
Severity filtering is a client feature and needs no database or model changes.
