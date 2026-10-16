# L03/L05 laboratory completion specification

Status: agent-authored specification; implementation and verification pending.
Authoring stage: `spec-creator`, 2026-10-16. Baseline: `b826857`, branch `feat/course-labs-completion`.

## Problem and outcome

Complete the missing L03 agent definitions and Intent Layer, and the L05 SDD
workflow and repository-document Project Context. A reviewer can see saved purpose
and scope, attach repository markdown to an agent/skill, run a review and inspect
the exact context that reached it. Smart Diff/PR Brief homework does not replace
these laboratory prerequisites.

Requirements come from the mentor/current-course captures
`work/l03-homework-current-20261016.txt` and
`work/l05-course-feedback-20261016.txt` in the parent workspace, the session's lab
requirements, and the official lesson branches
`upstream/lesson-3-lab/intent-layer-finish` and
`upstream/lesson-5-lab/sdd-finish`. The branches are reference implementations,
not replacement baselines. Preserve the current multi-agent, eval, CI, Skills,
grounding, cost, cancellation, and cache behavior while adapting their features.

## Scope and relationship to previous work

The existing repository text attachment editor and scoped `GET/PUT
/repos/:id/context` remain supported and continue feeding explicit PR Brief
generation. Their logical attachment names are never interpreted as filesystem
paths. Filesystem Project Context is an additional capability with explicit source
identity; it must not overwrite or reinterpret those saved text documents.

`specs/l05-pr-brief/spec.md` originally scoped only the homework's minimum text
attachment surface. Its non-goal excluding the full Project Context lab describes
that earlier task, not the now-authorized lab completion. This specification
supersedes that narrow exclusion only. All existing PR Brief guarantees remain,
including exactly one explicit generation call and the **32,000 UTF-8-byte** input
budget. Intent is generated separately; brief generation must not implicitly
recalculate it or add another model call.

Out of scope: Onboarding stretch; embeddings, retrieval, automatic document
selection/summarization, watchers, binary ingestion, add/upload/new-folder or
edit-in-place controls, and automatic document Git writes. The user has held video
submission: do not upload media or submit homework until that hold is explicitly
lifted. Implementers and the run-plan stage make no remote writes. After review,
the root may publish reviewed code and PRs under standing user authorization.
Video/submission criteria remain held for later handoff.

## Existing boundaries and compatibility

Root and package `AGENTS.md`, module architecture/review-contract documents and
`INSIGHTS.md` apply. Routes validate and resolve authenticated workspace; services
coordinate; repositories own scoped SQL; provider/filesystem work belongs to outer
adapters and server orchestration. `reviewer-core` stays free of DB, filesystem,
GitHub and document-selection I/O. Mirror every shared DTO change in client and
server, use current UI components/theme, and localize new copy.

At baseline `pr_intent` exists, but runtime has no classifier/core Intent input.
The purpose **summary** remains the existing `intent` wire field alongside
`in_scope`/`out_of_scope`; preserve Brief compatibility. Legacy rows lack SHA, so
freshness is **unknown**. Wire the existing Settings `review_intent` selection.

The existing `ReviewInput.specs` and `PromptAssembly.specs` provide the guarded
Project Context slot; `specs_read` is currently empty. Agent/skill records have no
filesystem attachments. A new distinct attachment field must not overload
`Skill.evidence_files`, skill bodies, agent versions, or text-context storage.

Current latest migration is `0016`. The final integrator owns **one combined new
migration after both feature schema changes**; concurrent implementers must not
edit migration journal/snapshots or generate competing migration numbers. Do not
rewrite migration history or change lockfiles incidentally.

## Development agent and workflow contract

Each `.claude/agents/` file has parseable frontmatter with unique `name`, routing
`description`, available model, explicit `tools` and role instructions. Referenced
skills exist; README/registry lists all eleven roles and handoffs. Adapt upstream
model labels to usable Codex delegation and record actual models honestly.

| Agent | Permission and responsibility boundary |
| --- | --- |
| researcher | Read/search research; no file mutation, commits, deployment or messages. |
| planner | Read-only planning; returns proposed work and dependencies without product writes. |
| implementer | Writes only the dispatched task's owned product paths; performs relevant verification. |
| test-writer | Writes owned test/fixture paths; does not change production behavior to make tests pass. |
| architecture-reviewer | Read-only structural review; no Write/Edit or mutating shell commands. |
| security-reviewer | Read-only security review, including ownership, traversal and injection; reports evidence and does not fix code. |
| plan-verifier | Read-only acceptance traceability; may execute non-mutating checks; no product/artifact edits. |
| doc-writer | Writes only dispatched documentation; grounds claims in observed source/results. |
| brainstorm | Read-only exploration and alternatives; no implementation or persistent changes. |
| spec-creator | May write only the designated `specs/` specification artifact; describes what/why and EARS acceptance. |
| implementation-planner | May write only the designated plan artifact; maps the agreed spec to tasks, owned paths, dependencies and checks. |

Tool frontmatter and body instructions must agree. A read-only role must not gain
write access through an unrestricted shell or nested delegated writer. Shell
access, where necessary for a verifier, is explicitly limited to read-only checks.
Scope changes and writes outside owned paths return to the orchestrator.

The SDD chain is `spec-creator → implementation-planner → run-plan →
plan-verifier`. `run-plan` consumes an existing agreed plan, delegates implementation
per its DAG, runs independent read-only architecture and completeness gates, and
uses a bounded fix loop (default maximum three iterations). Independent tasks may
run concurrently only with non-overlapping owned paths; dependent tasks wait for
their prerequisites. Preserve the upstream skill's separate test-author role:
`run-plan` does not spawn `test-writer`; implementers self-verify. The command does
not author the spec/plan, push, merge, publish, or claim unresolved criteria passed.
Existing session authorization supplies execution mode; do not repeat answered
clarifications or add an unnecessary approval gate.

Retain workflow-retro. Its report and `docs/retros/ledger.md` identify run,
topology including nested agents, actual models/order, measured tool calls,
input/output/cache tokens, timing and nullable cost, with journal/usage/result
sources. Unavailable counters are `unknown`/null with reason; estimates have a
separate method/label. Never invent actual tokens/cache hits. Cache ratios name
their compatible measured denominator.

## Intent Layer behavior

The classifier receives an allowlisted snapshot of scoped PR title, nullable body
and changed-file metadata (repository-relative path, additions/deletions and
optional numeric hunk ranges). It never receives patch strings, hunk bodies,
added/removed source lines, raw diff, full source files, or spread DB/PrDetail
objects. Empty body or no changed files yields a best-effort, explicitly limited
purpose from available metadata, without invented authoritative scope.

Classify once per uncached review batch, shared by its agents; reuse a valid saved
Intent where appropriate. An explicit `POST /pulls/:id/intent/recalculate`
reclassifies using `resolveFeatureModel(..., 'review_intent')` and the resolved
provider, validates the result and atomically replaces only that scoped PR's
Intent. Read endpoints and Overview opening/reload never trigger inference.
No summarizer, fallback, reference-fetch crawler or selection model is introduced.

Compare captured/current scoped PR heads before saving. Late or concurrent stale
results cannot overwrite newer Intent; return recoverable conflict and retain the
prior value. Record new provenance without inventing it for legacy rows.

Overview has an `IntentCard` displaying the purpose summary, In scope and Out of
scope, with explicit missing, pending, failure and freshness-unknown/stale states
where applicable, plus a recalculate action. It must remain useful before a PR
Brief exists; avoid duplicate contradictory Intent displays inside the existing
brief. Failed recalculation retains the previous successful card.

Review orchestration supplies the saved/classified Intent to the actual
`reviewPullRequest`/prompt path in both single-pass and map-reduce modes. Derived
purpose and scope are untrusted, delimiter-wrapped input under the unconditional
injection guard. They can inform rationale but **cannot waive or hide a real
vulnerability/correctness defect**, including defects claimed to be demos,
intentional or out of scope. Grounding, severity and CI gate policies remain.
Classifier failure is visible in logs/trace, degrades to review without Intent,
and does not corrupt saved Intent or prevent independent agent reviews.

## Project Context discovery, attachment and runtime contract

Discovery recursively finds `.md` files beneath directories named `specs`, `docs`
or `insights` at any depth of the selected repository clone, equivalent to
`**/{specs,docs,insights}/**/*.md`. The root names are centrally configurable,
and configurable roots must remain inside that repository. Arbitrary markdown
outside those roots is excluded. A path matching multiple root kinds is listed
once with the outermost matching kind. Exclude `.git`, vendor/dependency/build
trees and symlink/junction traversal. Missing clone gives an explicit unavailable
state and an empty list, not an invented successful scan.

The repository sidebar opens Project Context: path/kind/labeled token estimate,
filename/path search and safe read-only markdown preview, truthful summary and
loading/empty/unavailable/error states. Search preserves selection state; use the
existing safe markdown/link renderer.

Agent and Skill editors each have a Context tab with repository selection,
discovered document search/preview, attach/detach, persisted order and a running
estimate. Skill copy explains enabled loaded-skill inheritance. Persist ordered
`attached_docs: {repo_id, path}[]`, never bodies; owning workspace and repository
are checked. A repo A attachment cannot become an identically named repo B file.
This mutable config does not increment agent/skill body versions; existing actual
body/config version behavior remains intact.

For each local review run, take that agent's paths for the current repo in saved
order, then documents from its **enabled, loaded** Skills in saved skill order and
their saved document order. Deduplicate by repository plus canonical relative
path, keeping the first occurrence. Disabled, detached, foreign-workspace,
foreign-repository and other agents' documents never enter that run. Parallel
agents receive independent inputs/traces and cannot mutate each other's lists.

Read fresh immediately before review, once per selected file/run; keep that
snapshot through its chunks. Pass bounded full documents and safe source labels
through existing `ReviewInput.specs`; never read DB/filesystem inside core.
Preserve wrappers, guard and grounding. Skip unsafe/oversize documents with reasons
instead of silently truncating a claimed whole spec.

The context feature adds **zero** model, embedding, GitHub or selection calls.
This means no increase relative to the same existing review strategy: map-reduce
may already make several review calls, and the separate Intent stage has its own
accounted call. No attachments leaves the existing prompt behavior unchanged.

## Ownership, filesystem safety and explicit limits

Every discovery, preview and attachment request validates authenticated workspace
and parent repository ownership before filesystem or provider work. Agent/skill
updates also validate the owner and every referenced repository in that workspace.
Nonexistent/foreign entities return 404 without enumeration, model access, file
reads or DB mutation. Do not trust caller-supplied clone roots or resolve paths
against process CWD. Runtime uses only the clone of the scoped PR's parent repo.

Accept canonical relative POSIX document paths only. Reject absolute paths, drive
or UNC paths, backslashes, empty/dot/dot-dot segments, NUL/control characters,
non-markdown targets and paths outside configured roots. Resolve against the
trusted stored clone path, verify real paths remain inside that clone, and refuse
symlinks/junctions (including an unsafe parent component) and non-regular files.
Validate again at read time; attachment-time checks alone do not protect against
a path replaced with a symlink after selection. Bound reading before allocating
untrusted file contents; no unrestricted recursive scan or special-file reads.

Initial configurable safety defaults are an explicit design assumption: maximum
65,536 UTF-8 bytes per document, 64 selected paths per agent or skill, 2,000
discovered documents per scan, and 8,000 estimated tokens in the **assembled
context block** per run. Exceeding discovery limits is disclosed; invalid
attachment writes fail validation; runtime overflow skips whole documents in
deterministic attachment order and records each omission. Existing logical text
attachments retain their own 65,536-byte validation. The planner may replace
these defaults with stricter established adapter limits if it states the values,
units, behavior and acceptance fixtures before implementation.

Use the existing injected tokenizer where available. A fallback is explicitly
labeled `ceil(Unicode code points / 4)` and records its method; it is an estimate,
not provider-billed tokens or a guarantee against a provider context window.
Measure/check the wrapped block actually sent, including paths/delimiters.
Trace document bytes and estimate method separately from actual provider
`tokens_in`/`tokens_out`. None of these limits changes the PR Brief byte budget.

## Trace, brief reproducibility and retained invariants

Successful local run traces persist the exact `specs_read` paths, distinct
skipped paths with reasons, actual guarded `prompt_assembly.specs`, and its
labeled token estimate/method and byte amount. Legacy/CI traces without new
fields remain readable; unknown values must not masquerade as measured zero.
The drawer exposes read/skipped paths, Project Context block and token amount.
Do not fabricate tool-call timing or model usage to represent file reads.

The Brief's existing exact compact serialization of `{messages, schemaName,
schema}` plus its **1,024-byte framing reserve** must still satisfy
`budgeted_input_bytes <= 32000`. Persisted evidence distinguishes measured
payload bytes, reserve, budgeted total, `budget_unit: utf8_bytes`, actual
provider tokens, nullable cost and actual structured attempts. Preserve exact
assembled prompt/schema or sufficient local artifacts to reproduce that byte
measurement; use included path/content digest and omission provenance. Unicode,
escaping and wrapper overhead must be included. Context token estimates may not
be presented as that byte budget or as actual billed usage.

Preserve isolated agents, immutable membership, atomic outcome/trace commits,
cancellation, nullable costs, frozen evals and CI provenance/export/grounding.
Adding documents to CI exported manifests is explicitly out of scope: no clone
paths or bodies leak into artifacts/config. Disclose that local attachments do
not provide CI context parity. The existing CI demo agent has no selected docs;
default empty attachments retain its prior behavior.

## EARS acceptance criteria

All criteria below are required for lab completion unless explicitly marked
delivery-held. A fixture proves mechanics, not live model quality.

| ID | EARS requirement | Acceptance evidence |
| --- | --- | --- |
| AC-L03-01 | When the development-agent registry is inspected, it shall define the nine L03 roles and explicit matching read/write boundaries. | Parse/frontmatter and registry check; read-only roles have no mutation escape. |
| AC-L05-01 | When SDD tooling is inspected, it shall add spec-creator and implementation-planner plus run-plan and retain workflow-retro. | Eleven-role registry; run-plan DAG/owned-path/review/fix-loop/no-publish rules. |
| AC-L05-02 | When this run completes, spec and plan shall precede feature implementation, delegated implementations shall receive independent read-only architecture and plan-verifier review, and unresolved criteria shall remain visible. | Local artifact/commit order, dispatch reports, traceability matrix and bounded fixes. |
| AC-L05-03 | When workflow-retro records this run, all numeric token/cache/tool/cost metrics shall have measured evidence and unavailable counters shall be labeled unknown. | Ledger/report with source references and actual topology. |
| AC-I-01 | When classifying Intent, the model shall receive title/body and allowlisted file statistics without any hunk body, raw diff or source body. | Captured request/schema test with sentinel source text, empty body and missing-file cases. |
| AC-I-02 | When Intent classification succeeds, the scoped PR shall persist validated purpose, in_scope and out_of_scope using existing pr_intent semantics and the selected review_intent provider/model. | Settings override spy; actual PostgreSQL scoped upsert/read test. |
| AC-I-03 | When a user recalculates Intent through POST /pulls/:id/intent/recalculate, the system shall replace it only for the captured current PR head and preserve the prior value on failure or late-head conflict. | Provider failure, concurrent completion and head-race tests; no mutating GET. |
| AC-I-04 | When Overview opens, it shall render the independent IntentCard with scope lists and recalculate/missing/pending/error/freshness states without inference on read. | RTL/browser journey before Brief exists and cached reload provider spy. |
| AC-I-05 | When a multi-agent review begins, it shall share one Intent read/recalculation across the batch and supply that result to each real review prompt without inter-agent contamination. | Deferred providers, request capture and per-run trace assertions in both strategies. |
| AC-I-06 | If Intent classification fails, reviews shall continue with an explicit missing/degraded Intent notice and no fabricated scope or successful cache overwrite. | Failure-injected review integration test. |
| AC-I-07 | While derived purpose/scope is supplied to review, it shall be untrusted and shall not suppress real vulnerabilities because they are claimed intentional or out of scope. | Guard/wrapper regression fixtures and unchanged grounding/security tests. |
| AC-PC-01 | When discovery scans an available scoped clone, it shall return only recursive markdown under configurable specs/docs/insights roots, once per canonical path, with path/kind/estimate. | Nested-bucket, duplicate, out-of-root, vendor and alternate-root fixtures. |
| AC-PC-02 | If the clone is absent or scan is limited, discovery shall expose the unavailable/limited state and truthful counts instead of a false successful full scan. | Missing clone, scan cap, empty directory and error fixtures. |
| AC-PC-03 | When a reviewer opens repository Project Context through the sidebar, the page shall support path search, kind labels and safe read-only markdown preview with loading/error/empty states. | Component and browser navigation tests; hostile markdown fixture. |
| AC-PC-04 | When an agent or skill attaches/detaches/reorders documents in its Context tab, the system shall persist repository-qualified paths only and restore the order on reload without creating body versions. | Agent/skill DTO/storage integration and UI tests; no persisted body copies. |
| AC-PC-05 | When a run resolves documents, it shall combine that agent's current-repo paths with enabled loaded-skill paths in deterministic order and deduplicate first occurrence. | Direct+two-skills duplicate, disabled-skill and reordering request-capture tests. |
| AC-PC-06 | When multiple agents review concurrently, each shall receive only its own and inherited context and trace, even where other agents use identically named documents. | Deferred concurrent provider test with unique body sentinels. |
| AC-PC-07 | When selected files change after discovery or preview, the next run shall read fresh safe file content immediately before review through existing ReviewInput.specs. | Edit fixture on disk between preview and run; prompt includes new text. |
| AC-PC-08 | When files enter the prompt, each included whole document shall have untrusted wrapping/source identity and the unconditional guard shall remain active. | Exact assembled block test including closing-delimiter and injection payloads. |
| AC-PC-09 | If a selected document is missing, unreadable, unsafe, oversized or over budget, the run shall skip it with an explicit trace reason and retain valid survivors. | Per-document byte cap, set/token cap, empty file and missing-file tests. |
| AC-PC-10 | When context is discovered, previewed, attached or injected, it shall add zero model/embedding/GitHub calls relative to the same review without it. | Provider/network spies for reads and matched-strategy review calls, separate Intent accounting. |
| AC-PC-11 | When any request refers to a foreign workspace, repository, PR parent, agent, skill or document binding, it shall reject access before filesystem/provider activity or mutation. | Real DB ownership tests with foreign parent, same-path foreign repo, forged attachments and I/O spies. |
| AC-PC-12 | When a path is traversed or read, filesystem safety shall reject traversal, absolute/UNC/drive paths, symlink/junction escapes and replaced unsafe ancestors. | Temporary-clone adversarial tests; platform-supported link tests or explicit unsupported status. |
| AC-PC-13 | When an attached-context run completes, its trace shall display exact specs_read, skipped reasons, guarded block and labeled context token/byte amount without falsifying billed usage. | Persisted trace/drawer test and independent recomputation of block estimates. |
| AC-PC-14 | Where a legacy/CI trace omits new fields, the client shall render it compatibly and preserve existing CI/eval behavior. | Legacy DTO defaults and affected CI/eval regression checks. |
| AC-COMP-01 | When the existing generic repository text attachment is saved/read or used by Brief, it shall retain isolation, reload and generation behavior without filesystem reinterpretation. | Existing context/Brief suites plus same logical-name/file-path collision test. |
| AC-COMP-02 | When Brief generation measures its prompt, its unchanged 32,000 UTF-8-byte envelope-plus-reserve budget shall be reproducible and distinct from context token estimates. | Unicode/escaping/schema/wrapper boundary tests and exact input evidence. |
| AC-COMP-03 | When existing reviews, Skills, Smart Diff, PR Brief, multi-agent, eval and CI checks run, their relevant behavior/type/contracts shall remain valid. | Affected package suites/typechecks, mirrored-contract parity, mandatory real DB eval check. |
| AC-EVID-01 | When implementation evidence is reported, fixture tests and actual model observations shall be separate and missing live evidence shall not be labeled passed. | Local verification matrix with actual commands, revisions and artifacts. |
| AC-EVID-02 | While video/publication is held, the run shall make no uploads, submissions, messages or remote writes. | Local handoff with held delivery status. |

## Verification and handoff

Map every AC to owned paths and checks: injected providers/temp clones for
deterministic inputs/safety, isolated real PostgreSQL for ownership/races and RTL
for UI. A skipped platform link test is a limitation, not symlink coverage.

Run the affected server/client/reviewer-core typechecks and suites. Preserve and
run the established `pnpm verify:l06` gate, including its mandatory real
PostgreSQL suite, when reviewing the integrated review/trace changes. Verify
matching client/server contracts and combined migration integrity; skipped DB
checks are an open limitation, not green evidence.

Keep separately authorized live-model evidence outside fixture tests: Settings
model, source-free classifier input, saved/recalculated Intent, selected invariant
spec and actual review prompt/trace/finding, then cached reload. Report absent live
findings honestly. Provider usage stays actual and unknown Codex cost stays null.
No clarification blocks planning; stated safety defaults are assumptions. This
artifact does not certify implementation success, model quality or submission.
