# Client engineering insights

## 2026-10-13 — Eval history is stored data; only explicit actions start inference

Eval queries validate the direct contract schema and read stored cases, batches
and dashboard data. The two POST mutations disable retries. Run invalidation
uses the originating mutation agent, while conversion uses the server-returned
case owner (`src/lib/hooks/evals.ts:44`, `src/lib/hooks/evals.ts:52`); navigation
during acknowledgement cannot refresh another agent's cache. Running detail
polls until terminal and invalidates its stored owner's history and dashboard
(`src/lib/hooks/evals.ts:28`). Keep Run disabled after 202 until the acknowledged
batch is known terminal (`src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx:27`).

Null ratios and true zero have separate meanings. Completed batches alone show
numeric metrics; zero denominators show a reason. Deltas require different
completed runs with equal comparison keys and two defined ratios
(`src/components/eval-metrics/helpers.ts:5`, `src/components/eval-metrics/helpers.ts:14`).
Full stored prompts, ordered skill bodies, immutable snapshots and group output
remain inspectable rather than truncated to a summary
(`src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/BatchSnapshot.tsx:26`).

`pnpm test` passed 117 tests across 31 files, including 14 new eval interaction
and query tests; `pnpm typecheck` passed. These prove explicit conversion/run,
idempotent feedback, pending/error/retry, running-to-terminal refresh, exact
stored diff/prompt inspection, null/zero semantics, comparable-only deltas,
schema rejection and cache ownership. API fixtures are not model-quality
evidence; actual curation, production browser checks and prompt experiments
belong to the primary agent.

Independent review found that a collapsed FindingCard's mouse-only header
hid conversion from keyboard users. Its title/chevron is now a native expansion
button, with file links outside the control and guarded Enter/Space handling
(`src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:66`).
`pnpm exec vitest run EvalCaseAction.test.tsx FindingCard.test.tsx DiffTab.test.tsx
FindingsTab.test.tsx` passed 20 tests across four files after the fix, and
`pnpm typecheck` passed. New tests open collapsed accepted and dismissed cards,
retain focus, reach explicit conversion, isolate file-link keys and collapse.

## 2026-10-12 — PR Brief is explicit and focus follows real RIGHT rows

Runtime Zod imports must target the contract directly: the shared barrel's
`.js` exports failed Next.js resolution when introduced by the Brief hook.
`src/lib/hooks/brief.ts:4` imports the root-owned DTO schema directly; GET
validates the cached envelope and POST alone generates. Capture the original
PR/repository in mutation context before awaiting, so navigation during a
generation/save cannot put its result in the next route's cache
(`src/lib/hooks/brief.ts:26`, `src/lib/hooks/core.ts:160`). List reads that find
a changed head invalidate detail, Brief, Smart Diff and Blast queries without
generating (`src/lib/hooks/core.ts:117`).

Diff focus opens the target's group/file on mount or target change, then uses
the actual RIGHT-row ref; LEFT-only/missing lines scroll to the header with an
explicit notice (`src/components/diff-viewer/FileCard/FileCard.tsx:47`).
Exact path identity handles Unicode, brackets and quotes without interpolated
selectors. Users can collapse a handled target; mode switches retain existing
comment drafts. Caller-only paths show the indexed-snapshot limitation.

`pnpm typecheck` passed, and `node node_modules/vitest/vitest.mjs run` passed
103 tests across 26 files. The latter used approved escalation because the
local sandbox denied Vitest config resolution; it is the package test script's
configured runner. New tests prove explicit Generate/Regenerate, error cache
retention, scoped context save/reload, navigation races, stale-head GET refresh,
and precise grouped/original focus and fallbacks. These are fixture/API-mock
checks; actual inference and browser evidence are owned by the primary agent.

## 2026-10-12 — Per-run filtering and visible counters

The separate homework rubric requires each run to own its selection and the
pills to count the cards actually rendered. Keep state in FindingsPanel, after
confidence and severity filtering. Evidence:
`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:30`
and `src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilter/SeverityFilter.tsx:30`.

Five interaction tests cover run isolation, repeat-click reset, an absent level,
no runs, confidence-adjusted counts and zero network requests. The full client
suite passed 42 tests and typechecking passed. Browser checks on the seeded PR
confirmed Critical/Warning/Suggestion and repeat-click reset. The demo is a UI
fixture, not a model run. The hover component's four tests also passed after adding
focus/click support (`src/components/FindingsHoverCard/FindingsHoverCard.tsx:166`).

## 2026-10-12 — Starter layout limits phone-size validation

The shell reserves 264 px for the sidebar (`src/vendor/ui/shell/Sidebar.tsx:14`).
At 375 px the remaining PR content is cramped and horizontally overflows.
At 768 px the severity toolbar fits and can be selected. A phone layout needs
a separate shell/navigation change; wrapping the toolbar alone cannot solve it.

## 2026-10-12 — Avoid overlapping border color properties

Updating `borderColor` together with `borderLeftColor` produced a React style
warning when the focused finding changed. Use separate top/right/bottom colors
and preserve the severity stripe on the left. Evidence:
`src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:9`.
The warning disappeared in the passing interaction suite after this change.

## 2026-10-12 — Saved knowledge needs visible state and error recovery

Provider settings arrive asynchronously; synchronize the provider picker when
the persisted choice changes (`src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:15`).
Skill link mutations show errors and restore their previous local order on failure
(`src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:44`).
Prompt block weights are character-based estimates, not provider usage
(`src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx:37`).
`pnpm test` passed 46 tests and `pnpm typecheck` passed. Browser checks verified
actual saved versions, restored v3, agent link counts and both real comparison
traces. Reject/reload/Edit/Accept and the editable Skill draft worked through UI.

## 2026-10-12 — Smart Diff requires page-level completion refresh and real RIGHT anchors

RunStatus belongs to the Findings tab, so its completion callback cannot refresh
inline cards while Files changed is open. The PR page now mounts the persisted
run observer independently of tab selection; persisted terminal history polls
even if a short background run finishes between active-run checks. Evidence:
`src/lib/hooks/reviews.ts:47` and `src/lib/hooks/reviews.ts:72`. Background run
acknowledgements, action and deletion mutations invalidate both
representations, while server grouping is read without client reclassification.

Unified-diff metadata and a trailing newline are not numbered context rows.
`src/components/diff-viewer/helpers.ts:13` skips them; findings partition by
actual RIGHT keys and retain unmatched cards at file end
(`src/components/diff-viewer/findings.ts:29`). Group counts measure files with
findings, independent of the visibility switch. Shared components receive a
renderer callback instead of importing the page-local FindingCard.

Composer open/text state belongs above grouped/original layout remounts, keyed
by file, side, line and optional reply id. Evidence:
`src/components/diff-viewer/DiffViewer/DiffViewer.tsx:29`. Active drafts keep
their file/group open when remounted; the PR page keys DiffTab by PR identity
so a draft cannot leak to another PR.

After architecture-review fixes, `pnpm test` passed 67 tests across 20 files,
and `pnpm typecheck` passed. A real-hook fake-clock test covers background
completion whose running state was never observed; interaction tests preserve
and correctly post both new-comment and reply drafts after mode switches.
These are fixture/API-mock interaction and cache-lifecycle checks, not evidence
of a real model review.

Browser QA found that the compact severity badge hides its text label. Inline
FindingCards now opt into `showSeverityLabel`; existing callers retain their
compact default. Evidence:
`src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:60`.
After this focused change, `pnpm exec vitest run FindingCard.test.tsx
DiffTab.test.tsx` passed 10 tests and `pnpm typecheck` passed.

The course rubric also requires severity on the code row itself, rather than
only on the card. `src/components/diff-viewer/CodeLine/CodeLine.tsx:44` selects
the highest attached severity and renders a themed left stripe with the
localized blocker/warning/suggestion label on the right. Hiding comments
removes row markers along with cards; deleted-only and unmatched lines remain
unmarked. After this fix, `pnpm test` passed 69 tests across 20 files and
`pnpm typecheck` passed.
The final full `pnpm test` passed 69 tests across 20 files. Actual browser QA
confirmed three grounded findings below RIGHT:173/176/186, one finding-bearing
file, persisted Accept/Reject and new-comment draft survival during mode changes
(`../docs/evidence/l03/browser-checks.json`). Off-patch and external comment
posting remain deterministic-test evidence, distinct from this real run.

## 2026-10-12 — Blast Radius links belong to the indexed snapshot

Repository caller line numbers refer to the persisted index, which can differ
from PR head. `src/app/repos/[repoId]/pulls/[number]/_components/BlastRadius/BlastRadius.tsx:13`
uses indexed SHA for source links and plain text when that revision is absent;
it never guesses from PR head. The UI also explains snapshot coverage.
Same-named changed symbols match downstream groups by declaration file and
symbol name, keeping their endpoint and cron attribution separate. Top totals
come from server counts rather than summing duplicated caller relationships.

`src/lib/hooks/blast.ts:8` reads the scoped PR map. A partial map retains
available callers plus the degradation reason; loading and HTTP failure remain
distinct from a successful empty index. `pnpm test` passed 77 tests across 21
files, including eight Blast Radius query/interaction tests, and
`pnpm typecheck` passed. The tests use API fixtures; actual repository indexing,
browser checks and MCP parity are separate evidence owned by the primary agent.
