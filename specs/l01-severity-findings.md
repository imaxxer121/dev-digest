# L01 — review costs and severity findings

The implementation plan was approved on 2026-10-12. The separate 24-point rubric
was subsequently checked and the scope corrected to include all required surfaces.

## Behavior

Each expanded Review runs card shows verdict/score, visible severity pills,
three separate severity filter buttons and its findings. Filtering affects only
that run. Repeat-click resets; absent levels show the empty state. Confidence
filtering updates the visible counts. Navigation starts fresh local state.

The PR list shows persisted severity counts and a read-only preview headed
N FINDINGS IN THIS RUN. Detail cards retain Accept/Reject actions. Successful-run
cost is stored and displayed in the PR list total, Timeline and Trace Stats.
Unknown cost is —, never a fabricated zero. Trace also retains its findings section.

## Implementation and validation

Cost and preview components are adapted from the official MIT course lesson
branches c0a913b and db72302. The PR-total calculation deliberately sums every
successful run instead of the sample's 120-second window. Per-run filters and
visible counters have interaction tests, including multi-run isolation and no
network calls. Run typechecks, unit tests, database migration and browser checks,
then record a video of the actual UI. Every package has docs/specs and Read When links.
