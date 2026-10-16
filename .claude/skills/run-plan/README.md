# Run Plan

Read [SKILL.md](SKILL.md) to execute an existing agreed plan. Examples:

```text
/run-plan plan:specs/course-labs-completion/plan.md mode:multi max-fix:3
/run-plan plan:docs/plans/small-change.md mode:single max-fix:1
```

The workflow honors session authorization, dependencies and non-overlapping owned
paths, runs at most three implementers, and collects independent architecture and
completeness gates in parallel. Implementers self-verify; test-writer is available
for separate tasks and is not spawned here. Repairs stop at three rounds or earlier
on no progress. Files use the session's inherited model; actual usage is reported
only from observable runtime evidence.

The command makes no commits or remote writes. Manual pr-self-review follows the
final fixes, and workflow-retro is retained for an explicit request. Neither skill
installs Git hooks. Run `node scripts/check-development-agents.mjs` to statically
validate the local profiles and workflow contract.
