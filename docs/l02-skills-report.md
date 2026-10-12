# L02: Skills, Conventions and actual experiments

Implemented on 2026-10-12 on top of the L01 feature branch.

Skills and agent links are persisted in PostgreSQL. Markdown and bounded ZIP
imports preview core content before saving, including nested `SKILL.md`, and list
ignored files. Body edits create immutable versions; Restore creates a new
version. Creation/version snapshots are atomic, and concurrent body edits use a
row lock. Deleting Skills or agents removes actual rows and cascade links.

Agents and Skills are in Skills Lab. Cards show version/count or provider/model,
enabled switches and confirmation dialogs. The agent editor has Config and
Skills tabs, with search, ordered links and enabled-only dragging. The Skill
editor has Config, Preview, Versioning/full diff/Restore and Stats. Prompt traces
show the actual Skills body and an explicitly approximate character-based token
weight; provider usage is separately recorded from real inference events.

## Conventions

Extraction loads deterministic config files and up to 12 source paths from the
repo-intel facade. Unindexed repositories use source-symbol paths as a fallback.
One structured model call returns category, rule, source path, snippet and
confidence. Grounding discards unknown paths or snippets absent from loaded files,
and computes the line from the exact text. Accept, Reject and inline Edit persist
across reads. Re-scan replaces pending candidates while retaining decisions.
Only accepted rules are used to initialize the Skill draft. Its name, description
and body can be reviewed and edited in the modal before saving, or cancelled.

An actual Codex scan produced a naming candidate with evidence at
`server/src/platform/trace-builder.ts:37`. In the browser it was rejected and
reloaded, edited to match the observed helper, accepted, and composed into
`repo-conventions`. That Skill was attached to APIContractReviewer. Browser
versioning created v2 and Restore created v3 from v1. The extraction output and
immutable versions are in [evidence/l02](evidence/l02).

## Actual model comparison

Fixture: [PR #6](https://github.com/imaxxer121/dev-digest/pull/6), unchanged head
`486f7a6`. It renames `displayName` to `name` on `/v1/profile` without a version
bump and adds only a happy-path discount assertion. Both agents use
`codex/gpt-6.1-sol`, single-pass, repo intelligence disabled. For each pair, the
system prompt and diff remain unchanged; only saved Skills differ.

| Agent | Skills | Run | Findings | Result |
| --- | --- | --- | ---: | --- |
| APIContractReviewer | none | `ab2966a5-9573-4a4e-85b0-134febf38c19` | 1 | Already catches the public-field rename |
| APIContractReviewer | 4 API rubrics | `d788b434-511f-44c2-813d-ae07ce6b7cb8` | 1 | Catches the same rename |
| APIContractReviewer | final 4 course rubrics | `c925207a-a1dd-4f75-8c54-2a8b3d1b9b97` | 1 | Catches the rename with compatibility/schema/semver/deprecation directives |
| TestQualityReviewer | none | `4dc3d47f-d574-4ea5-ae96-51aaf9285667` | 2 | Rename plus a combined missing-boundaries/validation finding |
| TestQualityReviewer | test rubric | `29dc18ee-ac00-483a-a13c-916fc09c187a` | 3 | Rename plus separate threshold/zero and invalid-input findings |

The test rubric makes the output more specific: zero, 19.99, 20 and 20.01;
negative and non-finite inputs; expected RangeError and approximate arithmetic.
The baseline already recognized both classes of problem in the primary run.
An additional genuine no-Skills run `e899e6d5-01e0-41ad-854c-c451e4ff2036`
reported only the rename and missed coverage, illustrating variability. Its
initial Skill attachment request had failed validation, so it is not mislabeled
as an enhanced run. The primary comparisons preserve full traces and
findings. These small examples do not establish a measured quality improvement.

The rubric's requested API baseline miss did not occur. No such miss is invented.
Claude Code was unavailable, so manual self-review used the frontend and onion
architecture skills in this coding session. No git-push hook was installed.
These differences require mentor assessment; this report does not claim all
53 acceptance items have been independently certified.

## Verify enabled bodies and saved order

Composition run `d8c71e8c-bd61-4931-8199-99eca18ffbf7` has the repo-conventions
body followed by pagination, input validation and backward compatibility, in
the saved order. Response consistency was attached but globally disabled and
its body is absent. It was re-enabled after the check. The complete actual trace,
order assertions and approximate Skills weight are in
[skills-composition.json](evidence/l02/skills-composition.json).

The final API directives cover backward compatibility, response schema, semver
discipline and deprecation policy, each with directive descriptions and concrete
good/bad examples. Their final run used 18,015 input and 682 output tokens in
27.050 seconds. The additional convention Skill was reattached after that pair.

Codex uses its existing ChatGPT login and dynamic model catalog; this adapter
never reads or exports credentials. It runs an ephemeral CLI process in a separate
read-only scratch directory, validates structured output and records actual
tokens. The provider reports no dollar usage; `cost_usd` remains null. It does
not provide embeddings. Set `CODEX_CLI_PATH` to the installed executable when
using this optional local provider. This is distinct from API billing.
`GITHUB_API_OFFLINE=true` serves previously imported PR data without live REST
calls; exact Git revisions can still be fetched for review. This optional mode
was used after public GitHub REST timeouts. Demo file patches were cached from
the actual public Git commits, not generated as fictional fixtures.

## Validation and manual self-review

Client: `pnpm test` passed 46 tests; `pnpm typecheck` passed.
Server: `pnpm test` passed 140 tests, including real Docker/PostgreSQL integrations,
and `pnpm typecheck` passed. The 6 L02 integration tests include concurrent edits,
ZIP bounds, and saving an edited convention Skill draft.
Reviewer-core: `npm test` passed 23 tests and
`npm run typecheck` passed. No continuous browser e2e runner is claimed.

Manual review applied `.claude/skills/frontend-architecture/SKILL.md` and
`.claude/skills/onion-architecture/SKILL.md` through `pr-self-review`. It checked
route validation/workspace scoping, both contract copies, persistence and prompt
assembly, archive bounds, version consistency and browser states. It corrected
foreign/duplicate Skill linking, asynchronous provider selection, concurrent
version snapshots, mutation errors and keyboard handling. Approved-rule migration
backfill is separate from generated schema migrations.

Browser checks exercised import preview/save, Markdown preview, Config saving,
Versioning diff/Restore, agent Skill search/link toggles and Conventions
Reject/reload/Edit/Accept/Create Skill. Saved screenshots are under `assets/`.
Automated DB tests cover delete/direct DB deletion, ZIP bounds, immutable history,
workspace boundaries, link ordering and rejected-rule exclusion. Browser drag
gestures were not independently exercised; ordered persistence and actual prompt
composition were verified through the API and trace.

## Extractor quality observations

The first scan yielded only one grounded candidate. A valid citation demonstrates
an example, not that a convention is universal. Its broad statement about naming
was manually narrowed to the exported helper shown in the evidence before
approval. A useful next improvement is requiring several independent examples
for broad rules, grouping duplicate rules, and surfacing conflicting examples.
More source coverage should be measured separately from confidence scores.
A later actual re-scan added eight grounded candidates and retained the existing
accepted rule. The duplicate broader naming rule was rejected, leaving one
accepted, one rejected and seven pending. The modal then included only the
accepted rule, and Cancel closed it without creating a Skill. Another draft was
edited and saved through the UI as `repo-conventions-exported-helpers`.

## Demo

[Watch the step-by-step UI demo](assets/l02-skills-demo.mp4). It combines captures
of real browser states from this session, with time condensed. It shows extraction,
decisions, editable Skill creation, linking, and actual baseline/enhanced traces.
The baseline finding is shown honestly; no missed breaking change is invented.
This is an edited demonstration rather than a continuous screen recording.

## Provenance

Skills CRUD/import/versioning and editor scaffolding are adapted from the
MIT-licensed official lesson commit `db72302` in `burnjohn/dev-digest`.
Conventions sampling was informed by the official reference implementation;
evidence grounding, persisted decisions, composition, UI and optional Codex
provider were implemented and validated here. Reviewer directives with good/bad
examples are in [course-skills](../course-skills).
