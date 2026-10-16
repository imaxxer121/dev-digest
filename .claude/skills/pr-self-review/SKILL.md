---
name: pr-self-review
description: "Review a DevDigest diff before a commit or pull request; dispatch frontend and server checks based on affected paths."
---

Inspect the complete changed-file set against the task's actual baseline, including
staged, unstaged and untracked task files. Read applicable AGENTS.md, spec/plan ACs,
owned paths, affected module docs/INSIGHTS.md and actual verification evidence.
Do not assume origin/main is the correct baseline or include another worker's
unfinished changes as this task's verified work.

Route by affected paths and explicitly read the relevant local skill bodies:

- Client: `.claude/skills/frontend-architecture/SKILL.md`,
  `.claude/skills/react-best-practices/SKILL.md` and
  `.claude/skills/react-testing-library/SKILL.md`; add
  `.claude/skills/next-best-practices/SKILL.md` for App Router/RSC changes.
- Server: `.claude/skills/onion-architecture/SKILL.md`,
  `.claude/skills/fastify-best-practices/SKILL.md` and
  `.claude/skills/drizzle-orm-patterns/SKILL.md`.
- Mixed diffs: apply both lists. Reviewer-core: read its AGENTS.md, pipeline and
  grounding contracts; preserve injected-provider isolation and injection guards.
- Workflow/docs: inspect profile permissions, real skill references, DAG ownership,
  truthful evidence/model claims and the development-agent validation command.

Check behavior and failure paths, workspace and parent ownership before I/O,
untrusted input, filesystem/markdown safety, mirrored contracts and consumers,
independent run state, transactions/cancellation, nullable costs, accessibility,
translations and meaningful behavior tests. Trace each claimed AC to source and
actual evidence. A fixture, estimate, skipped check or unavailable runtime cannot
stand in for a live observation or measured provider usage.

Return file:line findings with a mechanism and consequence. Fix only within the
currently assigned owned paths; otherwise return a focused reassignment request
to the orchestrator. Read-only callers only report findings. Run relevant required
checks, record exact commands and observed results, and keep unresolved items
visible. Do not broaden checks after they pass without a change or concrete gap.

After the last fixes, perform a second uncommitted diff pass over the final
staged/unstaged/untracked task changes. Confirm the fixes introduced no regression,
scope drift or stale acceptance/evidence claims; rerun affected checks when the
last fixes require it. Record the revision/base and what was actually reviewed.

Invocation is manual. Do not install or enable Git hooks (including a push hook),
alter hook settings or claim automatic pre-push execution. This skill authorizes
no commits, remote writes, live models or unrelated actions. Preserve user holds
and report model/tokens/cache/cost as unknown/null when no source exposes them.
