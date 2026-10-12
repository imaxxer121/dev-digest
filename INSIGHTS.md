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
