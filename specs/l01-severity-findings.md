# L01 — PR findings by severity

Plan agreed on 2026-10-12 before implementation.

## Behavior

The PR's Agent runs tab shows All and three counts: CRITICAL, WARNING,
SUGGESTION. Each count comes from all persisted review runs for that PR.
Selecting a level shows only matching findings, with matching runs expanded.
Clicking that level again or All resets the filter. Counts stay stable while
filtering, so the user can choose another level without losing the totals.

Zero-count levels are selectable and show the existing no-match state. A PR
with no findings shows zero counters and its existing empty state. The
confidence toggle still works inside a selected level. Navigating to another
PR resets the selection. Buttons expose their selected state with aria-pressed
and work with the keyboard. The toolbar wraps when space is limited; browser
validation covers a 768 px viewport. The starter's fixed sidebar makes the
overall PR page unsuitable for a 375 px phone viewport; shell redesign is
outside this feature.

## Scope

Reuse fetched records; no new endpoint, migration or LLM call. Preserve the
original findings and per-run totals. Keep review actions and timeline intact.

## Verification and delivery

- Typecheck and client interaction tests covering multiple review runs, reset,
  empty levels and zero network requests while filtering.
- Browser checks on the seeded PR and a screencast of the actual interface.
- Open PR with a concise behavior description and actual validation results.
- Record verified discoveries using engineering-insights.

The separate real-review/Claude Code comparison is pending model access.
