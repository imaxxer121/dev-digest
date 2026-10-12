# PR import to findings

1. The server imports GitHub PR metadata and its diff in the pulls module.
2. The review executor gathers the diff, agent configuration and optional repo
   map. Reviewer-core assembles the prompt and calls the selected provider.
3. The grounding gate rejects findings whose cited lines do not exist in the
   diff. The server persists the remaining findings, review and run trace.
4. The client resolves the route's PR number to the stored PR ID, fetches its
   reviews and groups findings by run in `FindingsTab`.
5. Severity counts and filtering work on those existing records in the client.
   Filtering changes neither the stored review nor the prompt and starts no run.

The confidence toggle remains local to each run. Severity counts include all
persisted findings, including accepted/dismissed and low-confidence findings.
Repeated findings from separate runs are counted separately, like the existing
PR findings total. A selected severity opens matching runs; All restores them.

## L01 validation

Check CRITICAL, WARNING, SUGGESTION, All, repeat-click reset, a zero-count level
and confidence filtering. Verify that a filter click makes no review request.
The seeded PR is a deterministic UI fixture, not a new model review.

## Reviewer comparison

Real DevDigest reviewer runs and the same-prompt comparison in Claude Code
require model access. They have not been performed in this session. When access
is available, record the PR and commit, agent/provider/model, unchanged prompt,
findings with line references, elapsed time and run cost. Then explain which
findings are actionable, which are missed/false positives and what one prompt
change improves. Do not infer model quality from the seeded example.
