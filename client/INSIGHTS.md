# Client engineering insights

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
