# Smart Diff review fixture

This educational PR extends the official share-webhook demo commit `658e5f2`.
Its original authorship is retained. The route intentionally contains reviewable
defects and should not be merged into a deployed application.

The five changed file roles are the review route (core), a real diff-parser test
(tests), a module export (wiring), this explanation (docs), and a harmless comment
in the existing lockfile (boilerplate). No dependency version is changed.

Use a real reviewer run to check whether a finding on the route appears below
its exact new-side line in Smart Diff. Stored model output, not invented fixture
findings, provides the evidence for the UI demonstration.
