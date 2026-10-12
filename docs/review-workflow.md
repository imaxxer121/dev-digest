# PR import to findings

The pulls module imports GitHub metadata and diffs. The executor gathers context,
reviewer-core assembles prompts and grounds citations, and the server persists
reviews, findings and traces. The client groups findings by persisted review run.

Each FindingsPanel owns its severity and confidence state. The pills reflect the
cards currently rendered in that run; only present severities appear. Critical,
Warning and Suggestion buttons filter that run. Repeat-click restores all levels.
These operations read existing records and do not call a model.

Costs are captured from reviewer-core, shown in Timeline and Trace Stats, and
summed over all successful runs in the PR list. Missing prices remain unknown.
The PR-list findings popover previews the latest persisted run without actions;
Accept and Reject remain on detail cards.

## Model comparison

The UI demo uses the starter's seeded PR, not a new model review. Claude Code has
not been used. A separately logged Codex run can provide actual inference evidence
without an API key; its subscription does not expose a per-request dollar cost.
Never present an unavailable comparison or seeded output as a real experiment.
