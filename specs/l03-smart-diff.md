# L03 — Smart Diff implementation plan

Status: planned by the planner subagent on 2026-10-12. Implementation and
verification results belong in the final homework report, not this plan.

## Outcome and boundaries

The Files changed tab opens grouped by role, with all five groups visible in
this order: **core → tests → wiring → docs → boilerplate**. Docs and boilerplate
start collapsed. Users can restore the exact incoming `PrFile[]` order, inspect
the latest persisted review's findings inline, and retain GitHub comment and
finding actions. Smart Diff is a read over persisted data; it performs no Git,
GitHub or model calls. Intent Layer, schema migrations and review inference are
outside this feature.

Existing architecture: `server/src/modules/reviews/routes.ts` validates context,
`service.ts` coordinates operations, and `repository.ts` delegates SQL to
`repository/`. Client `DiffTab` is page-local; shared `DiffViewer`, `FileCard` and
`CodeLine` should stay independent of page-local finding components. Read and
apply the repository frontend-architecture and onion-architecture skills; mixed
diffs require pr-self-review. Module INSIGHTS are verified history, not new test
results. `docs/architecture.md`, referenced by the guides, is currently absent.

## Deterministic classification

Normalize separators to `/` for matching without altering the returned file
path. Match directory segments and filename patterns explicitly. Classification
precedence is **boilerplate → tests → wiring → docs → core fallback**; display
order differs from matching precedence.

| Role | Match rules |
| --- | --- |
| boilerplate | `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`; any `dist`, `build`, `__snapshots__` directory segment; `*.snap`, `*.generated.*`, `*.min.js` |
| tests | `*.test.ts`, `*.test.tsx`, `*.it.test.ts`, `*.spec.ts`; `test`, `tests`, `__tests__` directory segments; `e2e/**` |
| wiring | `index.ts`, `index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`; `.github/**`, `.claude/**` |
| docs | `*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE` |
| core | Every remaining path |

Required overlap examples: `__tests__/__snapshots__/x.snap` → boilerplate;
`.claude/skills/security/SKILL.md` → wiring; `e2e/README.md` → tests. Preserve
relative input order within each group. Never sort or mutate the incoming files
array to implement Original order.

## Server implementation

1. Expand `SmartDiffRole` to the five roles in both
   `server/src/vendor/shared/contracts/brief.ts` and
   `client/src/vendor/shared/contracts/brief.ts`. Keep `SmartDiffResponse` as the
   existing alias, preserving file fields and `split_suggestion`.
2. Add a pure `server/src/modules/reviews/smart-diff.ts` helper for classification
   and grouping. Emit all five groups, including empty groups. Each returned
   file contains its persisted path/additions/deletions, a null pseudocode
   summary, and unique sorted `finding_lines` from matching `startLine` values.
   A minimal split suggestion is `{ too_big: false, total_lines: sum(additions +
   deletions), proposed_splits: [] }`; this feature does not invent split plans.
3. Add a repository lookup for the latest **kind = review** row for this PR and
   workspace, then its findings. A newer summary must not hide an earlier
   review. Order newest-first by `createdAt`, with a deterministic tie break.
   Retain accepted/dismissed findings; actions change their state, not identity.
4. `ReviewService.smartDiffForPull(workspaceId, prId)` first verifies the PR via
   `getPull(workspaceId, prId)`, returns the existing not-found behavior when
   absent, and reads persisted `getPrFiles` and latest review findings. DB
   queries remain in repositories; grouping stays pure. No review means empty
   finding lines, and a latest review with zero findings must not inherit older
   findings.
5. Register `GET /pulls/:id/smart-diff` with `IdParams`, `getContext` and the shared
   `SmartDiffResponse` response schema in `routes.ts`. Do not import adapters or
   call the executor from this route.

## Client implementation

1. Add `usePrSmartDiff` to `client/src/lib/hooks/reviews.ts`, using the query key
   `["smart-diff", prId]`, shared response type and existing API helper. Add
   targeted invalidation for completed reviews, finding actions, deleted
   reviews/runs and relevant PR refreshes. Review completion must refresh both
   review records and Smart Diff while the user remains on the Diff tab.
   Existing `RunStatus` is only mounted on Findings; account for that explicitly
   through page-level completion tracking/polling rather than relying on that
   tab's callback alone. Test fast completion and navigation during a run.
2. `DiffTab` owns mode, visibility, latest kind=review selection, finding action
   mutation and its page-local `FindingCard` renderer. Receive or read current
   review records; distinguish “no review yet” from “latest review has zero
   findings.” Pass repository/head metadata so file links retain current
   behavior. API loading/errors must not pretend that the PR is reviewed and
   clean. Keep the ordinary file list usable with a clear fallback/retry state.
3. Extend the shared viewer through data props and a `renderFinding` callback.
   Do not import the PR-page `FindingCard` from shared components. Group files
   using Smart Diff path membership while rendering the original `PrFile`
   objects, including patches. Render all five accessible group accordions;
   use role/path keys instead of array-index keys. Docs and boilerplate start
   collapsed; core/tests/wiring start expanded.
4. A group badge counts **files with one or more latest-review findings**, not
   finding objects or distinct lines. File headers show a distinct finding dot
   and count human GitHub comments separately. Hiding cards does not alter
   these metadata counts. Multiple findings on one file increase its group
   finding-file count by one.
5. In `FileCard`, partition this file's findings by the actual parsed
   `RIGHT:newNo` keys. Show the same `FindingCard` immediately under its
   `start_line`, using `CodeLine` and the renderer callback. Add/context rows can
   host a finding; deleted rows cannot. Do not anchor by row index or old line.
   Render off-patch findings once at the file end, visibly marked as outside
   the shown diff. Missing/binary patches still retain their findings.
6. The shared Show/Hide comments control hides both existing human threads and
   finding cards; the existing new-comment composer behavior remains usable.
   Controls appear when either source has content. Accept/Reject uses
   `useFindingAction` with `prId`, persists through the existing server endpoint,
   and refreshes both representations. Reuse Markdown rationale/suggestion,
   category/confidence/severity, muted state and action error behavior.
7. Tighten `parsePatch` only as needed for trustworthy anchors: skip the unified
   diff `\\ No newline at end of file` metadata marker without incrementing
   either side; do not create artificial numbered context rows from trailing
   empty text or unrecognized metadata. Keep legitimate blank context/add/delete
   lines and multi-hunk numbering. Add targeted regression tests.
8. Add translated Smart Diff labels/states to
   `client/messages/en/prReview.json`; existing `smartDiff` keys already cover
   core/wiring/boilerplate and need tests/docs, mode, finding-file count,
   comments visibility and off-patch wording. Use theme tokens and accessible
   buttons with `aria-expanded`/labels for new controls.

## Verification checklist

### P1 — required behavior and data correctness

- [ ] Pure table-driven classification tests include every rule and all three
  precedence overlaps; unknown paths are core and group order is fixed.
- [ ] Endpoint validates IDs/context; a foreign-workspace or absent PR returns
  not found and exposes no files/findings. Shared contracts accept tests/docs.
- [ ] DB integration tests use persisted files plus old/new reviews and a newer
  summary. Only latest kind=review start lines are returned, duplicate starts
  are unique, latest empty review clears older markers, no-review works, and
  the endpoint does not invoke mocked model/Git/GitHub providers.
- [ ] Group UI shows five roles, docs/boilerplate collapsed, per-group input order
  intact. Original order exactly equals an intentionally interleaved input
  array and toggling back preserves membership without mutating it.
- [ ] Two findings on one file count as one finding-bearing file; a second file
  counts separately. Human comment count and finding dot remain distinct.
- [ ] Inline cards anchor under actual RIGHT start lines across multiple hunks;
  left-only matching numbers do not anchor. Off-patch/missing-patch findings
  appear exactly once at file end. Full Markdown/suggestion/category/severity
  and persisted Accept/Reject states remain intact.
- [ ] One visibility toggle hides/restores human comments and findings together;
  posting a human comment and opening its composer keep existing behavior.
- [ ] A completed real review updates Smart Diff and inline cards without page
  reload, including when Diff is open during completion. Action/deletion
  invalidation is exercised with meaningful query/interaction tests.
- [ ] Run server/client typechecks and relevant package suites, including the
  new DB integration tests. Record exact commands and results only after they
  complete; distinguish provider mocks from real review evidence.

### P2 — resilience and review/demo evidence

- [ ] Empty PR, five empty roles, loading/error/no-review/reviewed-zero states,
  duplicate finding starts, snapshot under tests, `.claude` Markdown, Unicode
  paths and CRLF/no-newline patch metadata have no disappearing content or
  false counters.
- [ ] New group/mode controls work with keyboard and have accessible labels;
  existing file expansion, per-file human threads, GitHub links and the active
  composer retain usable behavior across mode changes.
- [ ] Architecture reviewer checks route→service→repository boundaries,
  contract parity, shared-component dependencies, stale cache behavior and
  scope. Plan verifier maps each P1 item to code/test or explicitly missing
  evidence. Record actual handoffs and fixes from both reviewers.
- [ ] Capture a 1–3 minute real UI demo: all five roles/default collapse,
  precedence examples, grouped/original order, finding-bearing file counts,
  inline/full/off-patch cards, shared visibility, saved actions and completed
  review update. Deterministic fixtures are identified as fixtures; model
  findings and run IDs come only from actual runs. Edited captures must be
  described as edited rather than a continuous recording.
- [ ] Update affected module INSIGHTS after validation, then publish the L03
  report/evidence and PR. No invented model findings, tool names or successes.

## Ownership and expected files

Planner owns this spec only. Primary agent owns server changes and runtime/model
evidence. Implementer owns client changes, including its vendored `brief.ts`.
Architecture-reviewer and plan-verifier run after implementation and report
independently; the primary addresses findings before final publication.

Expected server paths: `src/modules/reviews/{routes,service,repository}.ts`,
`src/modules/reviews/repository/review.repo.ts`, new `smart-diff.ts`, vendored
`contracts/brief.ts`, new `test/smart-diff.test.ts` and
`test/smart-diff.it.test.ts` (or focused additions to existing tests).

Expected client paths: PR detail `page.tsx`, page-local `DiffTab`, shared
`components/diff-viewer/{DiffViewer,FileCard,CodeLine}` plus pure helpers/types
and optional role group component, `lib/hooks/reviews.ts`, vendored
`contracts/brief.ts`, `messages/en/prReview.json`, and focused helper/component
tests. Reuse the existing page-local FindingCard with the renderer callback.
