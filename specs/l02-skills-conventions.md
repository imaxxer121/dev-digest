# L02 — Skills and Conventions Extractor

Authorized on 2026-10-12. Base: the completed L01 branch. Skills CRUD, import,
versioning and editor scaffolding are adapted from official lesson commit db72302.

Implement persisted Skills CRUD/import/versioning and right-side previews; creation
and delete modals; ordered agent skills with disabled skills excluded from prompts.
Root/module AGENTS guides are primary; CLAUDE files contain @AGENTS.md.

The next stage is deterministic configuration + top-12 repo-intel samples,
structured inference and evidence validation; persistent Accept/Reject/Edit,
accepted-only skill composition and agent linking; actual no-skills/skills review
experiments. Use logged-in Codex CLI as an explicitly identified local provider,
without reading/extracting credentials. Its dollar cost is unknown. If the baseline
already finds an issue, report it honestly rather than forcing a fabricated miss.

Check the separate 53-point rubric, API/DB persistence, prompts, browser flows and
real model traces before treating L02 as ready to submit. Never submit unfinished
L02 as complete.

## Implemented and validated

Persisted CRUD/import/versioning, ordered enabled prompt bodies, module guides,
manual architecture/self-review skills and the Conventions flow are implemented.
Configuration sampling includes ESLint, TypeScript and Prettier names. Structured
evidence is validated against loaded snippets. Decisions survive re-scan and the
accepted-only draft supports editing metadata and body before save/cancel.
The UI evidence links resolve to real GitHub file/line URLs.

`docs/l02-skills-report.md` and its evidence bundles record actual model runs,
browser states, tests and the edited demo. The API baseline already detected the
breaking change; the expected miss is not fabricated. Claude Code was unavailable.
These course-specific differences are disclosed for mentor assessment.
