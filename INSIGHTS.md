# Engineering insights

## 2026-10-12 — Keep UI validation separate from model-quality evidence

The persisted seed findings support deterministic filtering checks, but do not
establish reviewer quality. The engineering-insights skill was applied manually
after validation; module notes contain verified results and final code references.
Its metadata passed `quick_validate.py` ("Skill is valid!"). Evidence:
`.claude/skills/engineering-insights/SKILL.md:18`, `client/INSIGHTS.md:3`,
`server/INSIGHTS.md:3` and `docs/review-workflow.md:26`.

Real DevDigest model reviews and a same-prompt Claude Code comparison remain
pending model access. Record the actual run identity, prompt, findings and
quality observations when access is available; never substitute seed data.
