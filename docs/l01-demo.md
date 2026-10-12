# L01 actual UI walkthrough

[Watch the demo](assets/l01-severity-demo.mp4).

The video uses screenshots captured from the actual local interface at each
interaction on the starter seeded PR #482: all findings, Warning, repeat-click
reset, absent Suggestion, Critical, and the PR-list findings preview. Each captured
state is held briefly for readability and the frames are encoded as MP4. The
fixture has one critical and one warning; it is not a new model review. Cost is
unknown because the fixture has no priced runs.

Validated on 2026-10-12: client typechecking and 42 tests; server typechecking and
103 unit tests; migration 0010 applied; browser filter/reset/empty/preview checks.
The four hover-component tests passed again after keyboard/click support. DB
integration and the standalone e2e runner were not run. Every package has docs,
specs and Read When links. Cost capture, Timeline and Trace Stats are additionally
covered by code/contracts and component tests.

A separate real Codex CLI inference completed using the existing ChatGPT login,
without an API key. It identified a response-field rename at src/api/profile.ts:2
in a supplied coursework diff. This is separate from the seeded UI video and is
not a Claude Code comparison or a DevDigest persisted run.
