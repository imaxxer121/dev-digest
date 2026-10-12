# Engineering insights

## 2026-10-12 — Keep UI validation separate from model-quality evidence

The persisted seed findings support deterministic filtering checks, but do not
establish reviewer quality. The engineering-insights skill was applied manually
after validation; module notes contain verified results and final code references.
Its metadata passed `quick_validate.py` ("Skill is valid!"). Evidence:
`.claude/skills/engineering-insights/SKILL.md:18`, `client/INSIGHTS.md:3`,
`server/INSIGHTS.md:3` and `docs/review-workflow.md:26`.

Actual Codex-backed DevDigest reviews are now recorded in
`docs/l01-review-report.md:20`. Four nonempty demo diffs completed, and a second
prompt on the unchanged webhook diff found the same two defects. Claude Code
comparison remains unavailable. Seed results remain separate from model evidence.

## 2026-10-12 — Subscription inference can be measured without inventing API cost

The optional Codex CLI adapter validates structured output and reads token usage
from completion events, while keeping dollar cost null. It uses its own login
without exporting credentials (`server/src/adapters/llm/codex-cli.ts:71`).
Saved traces preserve actual prompt bodies and outputs, which revealed both an
empty-diff attempt and a failed Skill attachment during this session. Compare
only valid runs, and retain failures separately (`docs/l01-review-report.md:58`,
`docs/l02-skills-report.md:53`). Manual self-review invoked frontend and onion
skills; its validation is recorded in `docs/l02-skills-report.md:92`.
