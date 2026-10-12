# Client engineering insights

## 2026-10-12 — Counts and visible findings have different inputs

PR severity totals must use the complete set of persisted findings across runs,
before severity or confidence filtering. Otherwise a selection erases the other
categories' totals. Keep the selection in `FindingsTab` and pass it down through
the accordion to `FindingsPanel`; expand matching runs so results are visible.
Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:48`,
`src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:48`
and `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:11`.

Five new interaction tests cover multiple runs, stable counts, category changes,
reset, empty categories, no findings and confidence filtering. The full client
suite passed 26 tests and TypeScript checking passed. The no-request assertion
is in `src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.test.tsx:96`.
Browser checks on the seeded PR confirmed all three levels, repeat-click reset,
All, keyboard Enter and selection at 768 px. Database `agent_runs` stayed 0
before and after these interactions; the demo is a UI fixture, not a model run.

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
