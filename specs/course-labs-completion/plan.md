# L03/L05 laboratory completion implementation plan

Status: ready for execution; no implementation success is implied. Specification:
`specs/course-labs-completion/spec.md`, baseline `b826857`, branch
`feat/course-labs-completion`.

## Execution mode

`mode:multi`, `max-fix:3`. The root orchestrator plus at most three implementers
may be active. Initial ready set is **T1, T2, T3**, dispatched concurrently with
each other's complete ownership lists. No nested implementers or test-writer;
implementers write their own meaningful tests. Finish the planning agent before
dispatch so all three slots are available. Then execute T4 → T5 → T6 → T7 → T8.
T6 runs two independent read-only reviewers concurrently. T7 is a bounded repair
phase, omitted when both gates pass. T8 remains root-owned evidence/handoff.

The user already authorized this pipeline and existing assignments; execution
does not wait for another approval. Adapt upstream run-plan's unavailable model
labels to usable Codex delegation, retaining its DAG/ownership/independent-gate
pattern and recording actual models. Root coordinates; a delegated integration
implementer owns T4 production edits. Root owns verification/evidence artifacts.

**Publication clarification:** the spec's broad remote-write hold overstates the
user's constraint. Video/upload/submission remain held. Implementers and run-plan
make no remote writes, commits, pushes, merges or PRs. After this pipeline, root
may publish independently reviewed code/PRs under the user's standing authorization;
that is separate from this local execution and never implies course submission.
Record this clarification in the final evidence matrix; do not block the work.

## Fixed boundaries and coordination

- Apply root/package AGENTS, package `docs/architecture.md`, package
  `specs/review-contract.md` and existing `INSIGHTS.md`; the root-relative versions
  of those two module guides do not exist. Use frontend-architecture for client,
  onion-architecture for server, pr-self-review for the mixed final diff, and
  engineering-insights only after observed validation.
- Port selectively from official `upstream/lesson-3-lab/intent-layer-finish` and
  `upstream/lesson-5-lab/sdd-finish`; L05 templates are readable at
  `../course-upstream-templates/l05`. Never replace current feature files wholesale.
- **Only T4 edits `server/src/modules/index.ts` or
  `server/src/modules/reviews/run-executor.ts`, after T1 and T2 complete.** T1/T2
  return integration snippets/signatures in reports, without editing these files.
- T2 alone owns Container/config, knowledge/project-context/trace contracts and
  both mirrored shared barrel exports. T1 must not edit Container: inspection
  confirms existing `container.reviewRepo` already exposes Intent methods.
  T1 owns Intent wire/schema files listed below and pure reviewer-core work.
- T1 and T2 may edit their distinct schema source files, but neither generates a
  migration or edits `server/src/db/migrations/**`. T4 alone generates **one**
  migration after both schemas settle, with journal and snapshot based on 0016.
- Preserve current group membership, `persistOutcome` transaction/cancellation
  compare-and-set, exact source/eval provenance, CI trust/export/grounding, costs
  and no-inference reads. Reviewers never overwrite code. Changes outside a task's
  owned set return to root for serial reassignment.
- Keep logical text attachments and filesystem attachments distinct. Keep Brief
  at **32,000 UTF-8 bytes**, exact serialized messages/schema plus **1,024 bytes**
  reserve, one explicit structured generation, separately recorded provider usage.
  This plan adopts the spec's explicit scope addendum to the previous Brief-only
  non-goal; Context estimates never change or substitute for that byte budget.
- Adopt spec defaults without another choice: 65,536 UTF-8 bytes/document,
  64 attached paths/agent or skill, 2,000 discovered docs/scan, 8,000 estimated
  tokens in the actual wrapped Context block/run. Skip whole documents in saved
  order; disclose caps. Use injected tokenizer, otherwise label the estimate as
  `ceil(Unicode code points / 4)`. Legacy missing measurements remain unknown.

## Task DAG

### T1 — Intent classification, persistence, pure prompt input and Overview

- **Owner/type/module:** implementer-intent; feature + tests; server/client/core.
  **Depends-on:** existing spec and this plan. **Skills:** onion-architecture,
  frontend-architecture, pr-self-review. **ACs:** AC-I-01–04, AC-I-07;
  supplies T4's AC-I-05–06; AC-COMP-01–03.
- **Owned paths:** new `server/src/modules/intent/**`;
  `server/src/modules/reviews/repository.ts`,
  `server/src/modules/reviews/repository/pull.repo.ts`;
  `server/src/db/schema/reviews.ts`;
  both `*/src/vendor/shared/contracts/{brief,review-api}.ts` copies;
  `reviewer-core/src/**`, `reviewer-core/test/**`;
  new `client/src/lib/hooks/intent.ts` and its tests;
  PR `_components/{IntentCard,IntentBlock,OverviewTab,PrBrief}/**` under
  `client/src/app/repos/[repoId]/pulls/[number]/`;
  new `client/messages/en/intent.json`, existing `client/messages/en/brief.json`;
  new `server/test/intent*.test.ts` and `intent*.it.test.ts`.
- **Action:** construct an explicit metadata DTO (title/nullable body/file path,
  counts and optional numeric hunk ranges), never pass source/patches or spread
  DB/detail objects. Resolve `review_intent` provider/model; validated scoped
  read/classify/recalculate operations retain the `intent` summary wire name.
  Add nullable provenance for legacy rows; row-lock/head and concurrent-result
  checks retain prior success on error/conflict. Provide one batch-preparation
  API to T4. GET/card reads have no inference. Show independent card before Brief,
  scope lists and missing/pending/failure/unknown/stale states, retaining saved
  success on failed recalculation. Remove duplicate contradictory Brief display.
  Supply optional pure ReviewInput Intent to both strategies, with delimiter
  wrapping and unconditional rule that purpose/scope never excuses a real defect.
- **Gotchas:** no Container/shared trace/barrel/migration edits; use direct DTO
  imports where Next runtime barrel resolution fails. Existing repository Intent
  access is unscoped internally: strengthen the public operation and both PR and
  parent-repo ownership, with no provider work before success. No extra Brief call.
  If trace needs Intent fields, send T2 the exact additive field contract; T2 alone
  writes trace copies, and T4 connects it. No inference implementation inside core.
- **Checks:** captured classifier request with secret source sentinels, no-file/
  empty-body handling, settings override, provider error + retained cache, actual
  PostgreSQL ownership/head-race/concurrent-result tests; RTL card/explicit POST/
  reload/no-Brief/error states; pure prompt guard/grounding and both strategies.
  Run affected package typechecks and focused suites. Report exact commands,
  results and integration API/signatures; pending registration is explicit.

### T2 — Safe Project Context, ordered attachments and Context UI

- **Owner/type/module:** implementer-context; feature + tests; server/client.
  **Depends-on:** existing spec and this plan. **Skills:** onion-architecture,
  frontend-architecture, pr-self-review. **ACs:** AC-PC-01–04, AC-PC-07–12,
  AC-PC-14; supplies T4's AC-PC-05–06, AC-PC-13; AC-COMP-01–03.
- **Owned paths:** new `server/src/adapters/project-context/**` and
  `server/src/modules/project-context/**`; `server/src/platform/{container,config}.ts`;
  `server/src/modules/{agents,skills}/**`;
  `server/src/db/schema/{agents,skills}.ts`;
  both `*/src/vendor/shared/contracts/{knowledge,trace,project-context}.ts` copies
  and `*/src/vendor/shared/index.ts`; new project-context hooks/shared UI;
  `client/src/lib/hooks/{agents,skills}.ts` and directly related tests;
  `client/src/app/{agents,skills}/[id]/**`;
  new `client/src/app/repos/[repoId]/project-context/**`;
  `client/src/components/app-shell/**`, `client/src/vendor/ui/nav.ts`;
  PR `_components/RunTraceDrawer/**`;
  `client/messages/en/{agents,skills,shell,runs,ci,projectContext}.json`;
  `client/src/components/ExportToCI/**` (disclosure only);
  new `server/test/project-context*.test.ts`, `project-context*.it.test.ts`,
  `server/test/attached-docs*.test.ts`, `attached-docs*.it.test.ts`.
- **Action:** outer adapter recursively scans only configured named roots under
  the trusted clone, deduplicates outermost-kind paths, excludes unsafe/dependency
  trees and limits traversal/reads. Validate canonical POSIX paths, scoped repo
  identity, real containment, every ancestor, no links/junctions, regular files,
  markdown and byte bounds again on runtime read. Reject foreign entities before
  filesystem/provider work. Persist ordered `attached_docs: {repo_id,path}[]`
  without bodies and without new agent/skill body/config versions. Preserve
  existing real version behavior. Agent/Skill Context tabs select repositories,
  search/preview and attach/detach/reorder; selection survives search and reload.
  Repository sidebar opens safe preview/list with truthful empty/unavailable/
  limited/error states. Reuse safe markdown renderer. Explain inherited enabled
  loaded Skills and local-context absence from CI exports without claiming parity.
- **Runtime handoff:** expose a resolver for direct agent docs then enabled loaded
  Skills in saved orders, current repo only, first canonical identity wins. Read
  fresh once/file/run; preserve snapshots across chunks and independent agents.
  Return safe source labels/full document strings, reads/skips/reasons/bytes and
  estimate method. T4 passes strings through existing `ReviewInput.specs` and
  measures/checks the actual guarded `prompt_assembly.specs`, including wrappers;
  no silent whole-spec truncation. T2 defines additive optional trace DTO fields
  and drawer rendering; absent legacy/CI values remain unknown.
- **Gotchas:** no core/Brief/logical-text-context/run-executor/modules-registry/
  migration edits. New feature namespaces auto-load through existing i18n loader.
  Keep `Skill.evidence_files`, bodies, frozen agent versions and CI manifests
  unchanged. CI UI only discloses lack of parity; no clone path/body exports.
  No models, GitHub, embeddings or selection calls. Document unsupported platform
  link fixtures explicitly instead of calling them passed.
- **Checks:** nested/alternate roots, duplicate roots, cap/missing clone/empty scan;
  traversal/UNC/drive/control/backslash and replaced-link ancestors; bounded byte
  reads, hostile markdown; actual PostgreSQL foreign repo/agent/skill bindings,
  order reload, no body/version changes; direct + two Skills/disabled/foreign/dedup
  fixture resolver tests; file edit between preview and run; estimates/whole-doc
  skip cases and zero-network spies; RTL repository navigation/Context editors/
  trace legacy compatibility/CI disclosure. Run server/client typechecks and
  focused suites; report exact resolver/signatures and registration needs.

### T3 — Eleven development agents and SDD harness

- **Owner/type/module:** implementer-harness; workflow + documentation + checks.
  **Depends-on:** existing spec and this plan. **ACs:** AC-L03-01, AC-L05-01;
  enables AC-L05-02–03. **Skills:** pr-self-review; workflow-retro as reference.
- **Owned paths:** `.claude/agents/**`, `.claude/skills/run-plan/**`,
  `.claude/skills/pr-self-review/**`, `.claude/skills/README.md`,
  new `docs/development-agent-registry.md`, `docs/agent-prompts/README.md`,
  new `scripts/check-development-agents.mjs`. Existing workflow-retro is retained;
  any necessary compatibility edit to its skill is owned here, but not ledger/run
  reports (T8). No other product files.
- **Action:** adapt nine L03 roles plus spec-creator and implementation-planner,
  unique parseable frontmatter, valid available model/tools/skills and explicit
  read/write ownership. Read-only roles cannot mutate via unrestricted shell or
  delegated writers. Document all eleven handoffs. Adapt run-plan existing-plan
  DAG dispatch, at most three workers, no test-writer, independent architecture/
  completeness gates, max-three repair/no-progress exit, no remote writes and
  session authorization. Enhance pr-self-review with owned-scope/routing and
  actual evidence checks while retaining manual invocation/no push hook.
- **Gotchas/checks:** no made-up Sonnet/model usage; explain Codex role mapping.
  Script validates registry/frontmatter uniqueness, eleven names, referenced
  skills and read-only tool/body agreement; inspect shell/delegation escapes and
  run-plan prerequisites/dependencies/fix cap/no-publish rules. Dry-run this
  plan's ready set/ownership without spawning nested agents or changing product.

### T4 — Serial integration and one combined migration

- **Owner/type/module:** delegated implementer-integration; orchestration/schema integration.
  **Depends-on:** T1, T2 (T3 need not block integration). **ACs:** AC-I-05–06,
  AC-PC-05–07, AC-PC-09–10, AC-PC-13–14, AC-COMP-01–03.
- **Owned paths:** exclusive `server/src/modules/{index.ts,reviews/run-executor.ts}`;
  `server/src/db/migrations/**`; integration-only tests
  `server/test/course-labs-*.test.ts` and `course-labs-*.it.test.ts`.
  Feature-owner paths may be reassigned serially for repairs only after their
  tasks return; record that reassignment. Do not casually widen ownership.
- **Action:** register Intent and filesystem-context plugins beside existing text
  Context. Prepare Intent once per uncached batch, use valid cache where appropriate,
  log classifier degradation and continue independent reviews. Before each agent
  invocation resolve that agent's fresh Context snapshot, deterministic inheritance
  and limits; supply Intent and specs in actual single-pass/map-reduce calls.
  Derive trace block/estimate/bytes from the actual guarded block and persist exact
  read/skipped identities with existing atomic outcome persistence. Keep immutable
  membership, cancellation and source provenance untouched. Generate/review/apply
  one new combined migration plus matching snapshot/journal, no history rewrite.
- **Checks:** deferred concurrent multi-agent request captures prove one classifier,
  unique Context sentinels/no cross-agent mutation, same snapshot across chunks,
  unchanged call count per strategy excluding separately accounted Intent; degraded
  classification still reviews. Actual DB scoped atomic persistence/head races/
  cancellation/trace rollback; migration clean apply and metadata chain from 0016;
  no selected docs preserves prior review/CI behavior.

### T5 — Integrated regression and byte-budget evidence

- **Owner/type/module:** root verification; checks and local evidence.
  **Depends-on:** T1–T4. **ACs:** AC-I-01–07, AC-PC-01–14, AC-COMP-01–03,
  AC-EVID-01. **Owned paths:** local `docs/evidence/course-labs-completion/`
  verification artifacts and `specs/course-labs-completion/verification.md` only;
  route failures to existing owners instead of silently editing product.
- **Checks:** server/client `pnpm typecheck`, reviewer-core `npm run typecheck`;
  server `pnpm exec vitest run --exclude '**/*.it.test.ts'`, client `pnpm test`,
  reviewer-core `npm test`; server `pnpm exec vitest run .it.test` using isolated
  real PostgreSQL, zero skipped required cases; root **`pnpm verify:l06`**, including
  mandatory real PG eval suite and mirrored contracts. Add/use meaningful Brief
  Unicode/escaping/schema/wrapper boundaries and logical-name/path collision
  fixtures; independently recompute exact saved payload bytes +1024 <=32000.
  Preserve provider actual tokens, nullable cost and structured-attempt evidence
  separately from byte/token estimates. Record command/revision/result artifacts;
  a blocked Docker/platform runner or skipped test is unresolved evidence.

### T6 — Independent architecture and plan gates

- **Owner/type/module:** architecture-reviewer + plan-verifier; parallel read-only.
  **Depends-on:** T5. **ACs:** AC-L05-02 and all product ACs by traceability.
  **Owned paths:** none; findings/matrix returned to root, who saves review artifacts.
- Give both the spec, plan, accumulated changed-file set/baseline, owner reports,
  exact test evidence and known limits. Architecture reviewer checks inward
  dependencies, scoping-before-I/O, hostile input/filesystem safety, independent
  snapshots, transactions/cancellation, frozen eval/CI provenance, DTO parity and
  renderer safety. Plan verifier maps **every AC** to source and actual evidence,
  marks implemented/partial/missing and separates fixtures from live observations.
  Neither reviewer fixes code, spawns writers or runs mutating shell operations.
  Security findings are explicitly included; no CI/eval file replacement.

### T7 — Bounded fixes and re-review

- **Owner/type/module:** root dispatches existing implementers; targeted repairs.
  **Depends-on:** T6. **ACs:** affected failed/partial ACs, AC-L05-02.
  **Owned paths:** explicit per-finding subsets of original task ownership, serial
  for shared files/migration metadata; maximum three implementers at once.
- Fix architecture critical/high and verifier missing/partial findings, rerun
  relevant checks and both reviewers on changed files/affected ACs. Maximum three
  iterations; stop on no progress and report residuals honestly. Medium/low
  findings are disclosed. Run relevant integrated gates again only if repairs
  change their behavior. Never label unresolved criteria passed.

### T8 — Root browser/model evidence, insights, retro and handoff

- **Owner/type/module:** root; evidence/documentation, no feature concurrency.
  **Depends-on:** T6 PASS or final T7 report. **ACs:** AC-L05-02–03,
  AC-I-02–05, AC-PC-03–08, AC-PC-13–14, AC-COMP-02–03, AC-EVID-01–02.
  **Owned paths:** `docs/evidence/course-labs-completion/**`,
  `specs/course-labs-completion/verification.md`,
  `docs/course-labs-completion-report.md`, `docs/retros/{ledger.md,course-labs-completion.md}`,
  root/affected package `INSIGHTS.md` after validation.
- First perform no-model browser reads on this exact build: sidebar discovery/
  safe preview, missing/unavailable states, agent + Skill selection/order reload,
  Intent card before Brief, cached reload with zero new inference, legacy trace
  and CI disclosure. On Windows use CUA against running local services and record
  runtime; do not claim an unavailable Unix/hermetic runner passed.
- Separately run already-authorized real-model evidence: recorded Settings model,
  source-free classifier request, saved/recalculated Intent, selected invariant
  document, actual review request/guarded trace/findings, persisted reload without
  new calls. Capture exact model/provider usage and artifacts; absent finding or
  absent live evidence remains explicit, never inferred from fixture passes.
  Reproduce Brief's unchanged byte budget from exact local serialization evidence.
- Apply engineering-insights with verified final source lines/results. Run
  pr-self-review on the final mixed diff. Record workflow-retro topology including
  planning and nested depth, actual models/order/fix rounds/tool counts/timing and
  tokens/cache/cost only from available journal/usage/result sources. Unknown
  counters/cost are null with reason; estimated metrics are separately labeled
  and cache ratios name a compatible measured denominator. Save complete AC
  matrix, actual commands/revisions/artifact paths and unresolved limitations.
  Final handoff distinguishes local filesystem Context from CI (no frozen docs,
  no parity claim), fixture versus live model evidence, and held video/submission.
  Do not upload, submit, message others or publish from run-plan.
