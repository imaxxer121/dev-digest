# L05 — PR Why + Risk Brief specification

Status: agent-authored specification; implementation and acceptance evidence are pending.
Authoring stage: `spec-creator`, 2026-10-12. Baseline: completed L04, `e7653ab`.
Requirements source: the complete GoIT L05 assignment captured in `work/l05-requirements.txt` outside this checkout, plus the user's session constraints conveyed to this stage.

## Goals

Help a reviewer opening a PR understand what it does, why it exists, where its risks are, and which files and lines to read first. Add a PR Brief on Overview containing a short summary, Risk areas, Review focus, and the existing Intent and Blast radius facts when available.

Generate only after an explicit Generate brief or Regenerate action. Each accepted generation makes one application-level structured completion call using the workspace's `risk_brief` provider/model setting. Persist the result for reloads, identify the PR head used, and clearly mark a saved brief stale when the PR head moves.

Ground the generated references in the changed-file set and persisted Blast radius callers. Send precomputed facts and attached text specifications to the model within a measured UTF-8 byte budget, without sending diff hunk bodies or source files.

Provide the missing minimum Project Context attachment path so a user can save a relevant text spec for this repository and see that the brief actually receives it. Keep every read and write scoped to both the workspace and parent repository.

Run the requested SDD stages in order: `spec-creator → implementation-planner → run-plan → plan-verifier`. Commit this specification and the agent-authored plan before implementation begins. Record actual cross-model availability and findings, then supply an open PR with implementation details and a 1–3 minute demonstration.

## Non-goals

- Reimplement Intent, Smart Diff, Blast radius, the repository indexer, or the provider adapters.
- Generate missing Intent with a second model call, fetch repository source for the brief, embed specs, or run an index/reindex as a brief side effect.
- Build folder watching, binary document ingestion, semantic retrieval, general document management, a new linked-issue database, or a full Project Context lab feature.
- Automatically generate on GET, page opening, reload, focus, a head change, a settings change, or a failed completion.
- Treat a risk brief as a code review or claim that inferred risks are verified defects. Verdict/score, PR history, graph UI, workflow retrospective, and a cost report are optional P3.
- Require Claude Code or an API key for this user's working Codex subscription provider. Do not claim a different-family plan review occurred unless it actually did.

## Observed baseline and constraints

The root, server, and client `AGENTS.md` guides and their architecture notes apply. Routes validate and obtain workspace context; services orchestrate; repositories own scoped SQL; container-provided ports own GitHub/model I/O. Apply the existing onion-architecture and frontend-architecture skills during implementation and pr-self-review for the mixed diff. Keep contracts identical in both vendored copies, use existing UI theme components, put text in next-intl messages, and record verified engineering insights after validation.

| Existing surface | Observed behavior | L05 use or gap |
| --- | --- | --- |
| `server/src/vendor/shared/contracts/brief.ts` and client copy | Intent, BlastRadius, Risk/Risks, PrHistory and PrBrief exist; PrBrief requires intent/blast/history and lacks summary/review_focus | Extend both copies together; missing optional facts must be representable |
| `server/src/db/schema/reviews.ts` | `pr_brief` contains only `pr_id` and JSON; `pr_intent` has no SHA/version | Reuse JSON cache; report Intent freshness as unknown rather than inventing it |
| `server/src/modules/reviews/repository/pull.repo.ts` | Workspace-scoped pull lookup; intent/files lookup is by PR ID | Check the PR and parent repo before using dependent reads; new brief repository predicates remain scoped |
| `server/src/modules/blast/service.ts` and helpers | Checks PR and parent repo; reads persisted repo-intel; returns summary, callers, counts, indexed SHA and degradation reason | Reuse its fact mapping without Git, parser, indexer, or LLM calls |
| `server/src/modules/reviews/smart-diff/` | Pure path-role classification already exists | Reuse classification for file statistics; no model or pseudocode generation |
| `server/src/modules/settings/feature-models.ts` | Resolves workspace override, else registry default for `risk_brief` | Use this resolver and `container.llm(choice.provider)`; no hardcoded working model |
| `server/src/adapters/llm/codex-cli.ts` | Uses its own CLI login in a separate read-only scratch directory; structured completion calls infer once and returns `attempts: 1`, actual token usage, unknown dollar cost | Working inference path for the demonstration; do not export credentials |
| OpenAI/Anthropic/OpenRouter structured adapters | Structured reprompt retries are configurable; transport retries may also exist | Supply `maxRetries: 0`; distinguish one service call/structured attempt from adapter transport behavior |
| `server/src/vendor/shared/contracts/platform.ts`, client `useContextFiles` | SpecFile and Project Context query scaffolding exist | No registered context module, context API, or context page exists at baseline |
| `server/src/db/schema/context.ts` | `code_chunks` supports workspace/repo/path/content/source=`spec`, nullable embedding; no unique path or update timestamp | Store plain text attachments here; no migration/embedding needed; do not fabricate `updated_at` |
| `server/src/adapters/github/octokit.ts` | Resolves the first supported `#number` body reference to an issue during live PR detail retrieval | Issue data is not persisted; offline pulls have no issue body. Explicit brief generation may resolve the supported reference read-only |
| `server/src/modules/pulls/routes.ts` | Live detail replaces stored files/body/stats but does not currently persist returned `head_sha`; replacements are separate writes | Narrowly fix successful refresh to persist coherent head/files/body/stats for reliable cache freshness |
| PR Overview / DiffTab / DiffViewer | Overview renders description and BlastRadius; query controls tab; files/groups can collapse; file and RIGHT/LEFT row data attributes exist | Add Brief/Intent UI and a page-owned focus target passed into diff components |

No new database table is required. Do not change generated migrations, lockfiles, credentials, or unrelated review behavior.

## Input facts and provenance

Generation captures one persisted PR snapshot after validating that its PR workspace and its parent repository workspace both equal the authenticated workspace. The cache is tied to that snapshot's nonempty `head_sha`. All descriptive text is untrusted data: the system instruction forbids following instructions inside descriptions, issues, Intent, or attachments and forbids tool/source access.

| Input | Authoritative source | Permitted model fields | Provenance and missing-data behavior |
| --- | --- | --- | --- |
| PR identity / purpose | Scoped `pull_requests` row | Number, title, head SHA, bounded body | Source `persisted-pr`; empty/null body is explicitly missing, not an invented purpose |
| Intent | Existing `getIntent(prId)` after ownership checks | `intent`, bounded `in_scope` and `out_of_scope` | Source `pr_intent`; absent row is missing; SHA coverage is unknown because this table has no SHA |
| Blast radius | Existing scoped BlastService / persisted repo-intel | Summary, counts, indexed SHA, degraded/reason, caller names/files/positive lines | Source `persisted-repo-intel`; preserve partial facts and reason; no-data/flag-off/failure is explicitly unavailable or degraded; indexed SHA is not PR-head proof |
| Diff size / roles | Persisted `pr_files` metadata plus existing pure Smart Diff classifier | Path, additions, deletions, role, numeric candidate line starts | Source `pr_files`; no `patch`, raw diff, hunk string, source content, pseudocode or finding rationale enters the model envelope |
| Candidate review lines | Local numeric extraction from persisted patch headers, plus caller lines from the index | Positive new-side hunk starts with nonzero new-line count; at most four starts per changed file; caller line | Source `diff-line-metadata` or `indexed-caller`; numeric facts only. A file with no known new-side anchor may be reviewed at its file header; no invented source line is certified |
| Linked issue | Existing supported first same-repo `#number` reference in the captured PR body, resolved through `container.github().getIssue` only during explicit generation | Number, title, state, bounded body | Source `github-issue`; `not_linked` when no supported reference, `unavailable` on offline/config/network/lookup failure; no fabricated issue body or hidden model call |
| Attached specs | Scoped Project Context repository read of `code_chunks` rows with source=`spec` | Logical path and bounded saved content | Source `project-context/spec`; each included attachment records original/included UTF-8 bytes and content digest; no attachments is explicitly missing; code/docs rows are excluded |
| Model selection | `resolveFeatureModel(container, workspaceId, 'risk_brief')` | Not explanatory facts; request model/provider | Persist/log the actual resolved choice; Settings changes affect the next explicit generation |

Use statuses `available`, `missing`, or `unavailable`, with bounded reason strings, truncation flags and original/included/omitted counts as applicable. The UI shows a deterministic missing-data notice for missing Intent, unavailable Blast radius, missing description, missing/unavailable issue, and absent specs; it does not rely on model prose to disclose these gaps. A healthy empty Blast radius is distinct from unavailable data. A degraded map retains its available callers and indexed SHA.

Attachment contents and source facts are snapshotted at generation. Spec edits or model-setting changes do not silently invoke inference; Regenerate uses their current values. The interface may explain that the saved brief represents the inputs recorded at generation. Required stale detection is based on PR head SHA.

## Measured model-input budget

The hard limit is **32,000 UTF-8 bytes of application-controlled model input**, not 8,000 assumed tokens. Use Node's UTF-8 byte measurement, never JavaScript string length as a token count. This budget includes the system instruction, serialized user facts, output JSON schema/schema name, message/envelope framing, and a conservative **1,024-byte adapter framing allowance**. It does not claim to measure provider-internal hidden prompts or tokenizer usage.

Measure the compact UTF-8 serialization of an envelope containing the exact `messages`, `schemaName`, and JSON schema supplied to `completeStructured`; add the 1,024-byte allowance. Report `measured_payload_bytes`, `adapter_framing_allowance_bytes`, `budgeted_input_bytes`, `input_budget_bytes: 32000`, and `budget_unit: utf8_bytes`. Assert `budgeted_input_bytes <= 32000` immediately before the call. The allowance is labeled as a reserve, not as measured provider text. Actual provider `tokensIn`/`tokensOut` remain separate usage fields; Codex cost remains null when no price is available.

Assemble a whitelist of scalar/numeric fact fields instead of spreading DB rows or PrDetail/files objects. This prevents accidental inclusion of `patch`/raw diff. Sort files by existing role order then path; sort callers by file, line, name; sort specs by logical path and stable ID. Preserve model Review focus order after validation.

Bound the compact serialized fact sections as follows; the final total check takes precedence over every section quota:

| Section | Maximum UTF-8 bytes |
| --- | ---: |
| PR title/body | 4,600 |
| Linked issue | 2,500 |
| Intent | 2,000 |
| Blast summary/metadata/callers | 3,400 |
| Changed-file statistics/roles/numeric anchors | 5,500 |
| Attached-spec path/content entries | 8,000 |

Reserve the remaining capacity for system/schema/envelope/provenance framing. Cap text attachments included in the model envelope at eight and callers at 64. Keep source counts for omitted entries. Keep full authoritative changed/caller path sets on the server for output validation even if their model representation is truncated.

Trim text at Unicode code-point boundaries to a UTF-8 prefix; do not split UTF-8 sequences or corrupt JSON. Array sections include only complete entries and report omitted counts. Select spec contents deterministically in path order, retaining a bounded prefix and original/included byte counts; at least one nonempty attached spec contributes content when it exists and fits. Recompute after serializing, including escaped characters and metadata. If necessary, reduce optional text/entries in this fixed order: additional spec entries and tails, PR-body tail, issue-body tail, caller tail, additional file entries, Intent list/text tails. Keep every truncation truthful. If even the fixed envelope with empty optional text exceeds the limit, fail before inference with a clear input-budget error. Never send an oversized prompt or make a second summarization call to fit it.

The planner must include adversarial multibyte text, JSON-escaping overhead, many files/callers/specs, and a sentinel patch body in budget/input tests. Logs and evidence must show actual measured byte values, included spec paths/digests and omissions rather than a claimed token approximation.

## Concrete contracts and HTTP behavior

Both `brief.ts` copies must agree. Preserve existing Risk/Risks and history wrappers. The generated-output schema is a separate strict object containing exactly `summary`, `risks`, and `review_focus`.

| Contract | Required shape / validation |
| --- | --- |
| Generated output | Nonempty summary, maximum 1,600 characters; risks array maximum eight; review_focus array maximum eight |
| Generated risk | Existing `kind`, `title`, `explanation`, severity `high/medium/low`, and `file_refs`; nonempty title/explanation and at least one reference before grounding; bound text to practical UI lengths |
| ReviewFocus | `file: string`, `line: positive integer`, `reason: nonempty string` (maximum 1,024 characters) |
| PrBrief cache document | `version: 1`, `head_sha`, ISO `generated_at`, `summary`, `review_focus`, `intent: Intent or null`, `blast: BlastRadius or null`, `risks: {risks: Risk[]}`, `history: {history: []}` unless real history already exists, and provenance/generation metadata |
| Generation metadata | Actual provider/model; application structured call count; structured attempts when returned; measured input metrics; actual token usage and nullable cost when supplied; counts of discarded references/items |
| Provenance | Bounded per-input status/source/reason and truncation/count information; included spec path/digest/original/included bytes; captured PR SHA and indexed Blast SHA where available |
| Brief response | `{ brief: PrBrief or null, current_head_sha: string, stale: boolean }`; current SHA is read from the scoped durable PR state, stale compares it with cached `head_sha` |

`GET /pulls/:id/brief` validates the ID and workspace/parent ownership and reads only durable PR/cache state. It returns HTTP 200 with `brief: null, stale: false` for no cache. It never calls a model, GitHub, Git, tokenizer, parser, spec filesystem, or indexer and never writes DB state. An invalid legacy cache document is treated as unavailable with a clear client state and a diagnostic; do not return unvalidated JSON or silently regenerate it.

`POST /pulls/:id/brief` accepts an empty body, validates ownership before all dependent work, snapshots available facts/specs, resolves `risk_brief`, and invokes `completeStructured` once with the generated-output schema and `maxRetries: 0`. It does not invoke `complete`, embed, an Intent layer, a review pipeline, map/reduce, automatic retry, or another fallback model. A returned `attempts` value other than one is a failed generation and preserves the cache; do not conceal a reprompt. Provider/configuration/preflight failures can fail before that one call; failed output is not regenerated automatically. This is a synchronous request with a visible pending UI; use the provider's existing bounded timeout and disable the action while pending. Brief metadata/logs are sufficient evidence; do not invent review `agent_runs` rows for this separate feature.

Validate the model shape, then ground all paths against exactly `changedFiles ∪ blastDownstreamCallerFiles` from the captured scope. Specs, symbol declaration paths outside the PR, generic repo files, endpoint strings and guessed paths do not expand this set. Require exact repository-relative POSIX identities; do not sanitize a fabricated path into a valid one. Remove invalid file_refs from a risk and discard the risk if none remain. Discard a Review focus item with an unknown path. Deduplicate retained references/items while preserving focus order. Empty grounded arrays are valid and have truthful empty states. Do not fabricate replacement risks or a focus item merely to fill the UI.

Changed-file candidate lines are advisory facts. Review-focus line must be positive; if it cannot be found as a rendered RIGHT row, opening the file header with an explicit line-unavailable notice is acceptable. Caller-only line numbers belong to the indexed snapshot; show the snapshot limitation and the caller-not-in-diff message rather than pretending those rows exist in the PR.

Before cache upsert, recheck scoped PR head. If it moved during generation, return HTTP 409 `brief_head_changed`, preserve the previous saved brief, and let the user explicitly retry against the new head. Persist only a validated grounded completed document. Provider/schema/DB failure preserves the previous cache and reports a recoverable action error. Enforce same-PR in-flight serialization or reject a competing POST with HTTP 409 `brief_generation_in_progress`; no automatic queued second call. In the current single-server deployment, a service-level guard is sufficient. A later multi-instance deployment needs a durable lock design.

Every not-found or foreign-workspace PR/parent repository returns 404 before model/GitHub access and performs no database mutation. Cache SQL must not rely on the cache table having its own workspace column: scope through the associated PR and parent repo. Logging must distinguish an application structured call/attempt from possible existing transport retries. Do not overclaim that all providers make one network request.

## Minimum Project Context attachment contract

Add a `context` module with routes/service/repository boundaries and a repository Project Context editor, either a page at `/repos/:repoId/context` reachable from the existing shell context navigation or a clearly labeled inline Overview manager. Use the existing SpecFile shape and query scaffolding. The baseline has no code_chunks readers/writers in server runtime modules, so no existing indexer replacement was found; preserve source=`spec` if a later discovered bulk chunk replacement touches this table.

- `GET /repos/:id/context` returns only this workspace/repository's saved source=`spec` documents as SpecFile entries, with content, byte `size`, and `updated_at: null` when no timestamp is available. It has no model, embeddings, indexing, Git, or filesystem side effects.
- `PUT /repos/:id/context` accepts `{path, content}`, saves or replaces one logical text attachment, and returns the saved SpecFile. Validate nonempty repository-relative POSIX logical paths, maximum 256 characters, rejecting absolute paths, backslashes, control characters, empty segments, `.` and `..`; validate nonempty UTF-8 text of at most 65,536 bytes. A logical path is an attachment name, not a server file to read.
- Read and write predicates require workspace ID, repo ID and source=`spec`; validate parent-repo ownership first. Same-path replacement is transactional, using the existing table without overwriting source=`code`/`docs` rows. Resolve duplicates deterministically; concurrent same-path saves must not create ambiguous attachment versions. A repository-scoped transaction lock is acceptable without a migration.
- The page lists saved documents and supplies logical path/content inputs, Save and edit controls, pending/error/empty states, and persistence on reload. It says these saved text specs feed the PR brief. Replace scaffold copy suggesting folder ingestion or every agent reads specs, because those capabilities are absent.
- Brief generation calls the same scoped context service/repository read. Missing attachments are reported; an attached document's saved content appears in the measured model facts with path/digest provenance. No reindex endpoint, vector retrieval, or reviewer-wide knowledge integration is required for L05.

## Overview and Files changed behavior

Overview contains a labeled PR Brief region. Before a valid brief exists, show Generate brief and explicit unavailable/missing fact information. During POST show a pending state and disabled action; after success show summary, Risk areas, Review focus and Regenerate. Keep Intent and the existing Blast radius component adjacent within the brief area without duplicating the Blast radius block. Intent has its saved scope lists or an explicit missing state. Risk cards show severity, title and each retained file reference; explanation can be visible directly or expandable.

Read cached data through a TanStack Query GET hook keyed by PR identity. Explicit POST alone creates/regenerates. A success updates/invalidate the brief cache; an error retains the last successful card. A stale cached card stays visible with a clear head-moved label and Regenerate action; no automatic regeneration occurs.

Review focus is an ordered keyboard-accessible list labeled with `file:line — reason`. Clicking sets `?tab=diff&file=<encoded path>&line=<positive line>` through page-level navigation, preserving unrelated query parameters. DiffTab/registered shared diff components receive the target as props; they open its role group and file in grouped and original modes, then scroll to the existing matching RIGHT row. Use element/ref identity instead of unsafe unescaped path selectors. Direct URL/reload works and never creates a brief. If the file is absent from this PR's diff, show `File not in this PR's diff`; if present but its line is absent, open its header and explain that the line is not displayed. Keep existing review cards/comments/drafts behavior intact.

UI copy belongs in `client/messages/en/brief.json` and the existing context namespace. Add labels for PR Brief, Generate, Regenerate, pending/failure/stale, summary, Risk areas, Review focus and missing-data messages; replace the misleading current `unavailableHint` suggesting opening a PR computes a brief. The optional VerdictBanner may reuse the latest existing review verdict/score, but the summary displayed for L05 is the brief summary.

## EARS acceptance criteria

P1 means a course submission blocker. P2 and P3 retain their course priority; the explicit session constraints for scoping, budget and one application model call are implementation requirements even where the course marks them P2.

| ID | Priority | EARS requirement |
| --- | --- | --- |
| AC-01 | P1 | When a user opens a PR Overview without a saved valid brief, the system shall show a PR Brief region with Generate brief. |
| AC-02 | P1 | When an explicit Generate brief succeeds, the system shall display a short what-and-why summary, Risk areas and ordered Review focus. |
| AC-03 | P1 | Where saved Intent and Blast radius facts exist, the system shall display them adjacent to the generated brief; where they are absent or degraded, the system shall disclose the specific missing/limited input and still generate from available facts. |
| AC-04 | P1 | While a brief is displayed, each retained risk shall have a title and at least one real allowed file; each focus item shall have a file, positive line and reason. |
| AC-05 | P1 | When a provider cites a path outside the captured changed-file and blast-caller union, the system shall discard that reference/item before persistence and rendering. |
| AC-06 | P1 | When a user activates a focus item for a changed file, the system shall open Files changed and expand that file in its applicable role group. |
| AC-07 | P1 | When the user reloads or revisits the same PR head, the system shall display its saved brief through GET without a model invocation. |
| AC-08 | P1 | When the user explicitly activates Regenerate, the system shall create a new result from current captured inputs and replace the successful cache once. |
| AC-09 | P1 | When the feature is submitted, the PR shall contain agent-authored spec.md and plan.md, an implementation description, and a 1–3 minute demonstration showing the requested journey. |
| AC-10 | P2 / required | When an accepted generation reaches inference, the brief service shall make exactly one completeStructured call with maxRetries zero and shall record the actual provider/model, application call count and returned structured attempts. |
| AC-11 | P2 / required | Before inference, the system shall measure the exact application input envelope plus labeled framing allowance in UTF-8 bytes and shall enforce the 32,000-byte total. |
| AC-12 | P2 / required | When assembling model facts, the system shall exclude every diff hunk body, patch/raw diff field and source-code body, including under truncation/oversize cases. |
| AC-13 | P2 | When parsing/cache-serving a brief, the system shall validate the extended matching client/server contract including summary and review_focus. |
| AC-14 | P2 / required | When generating a brief, the system shall resolve risk_brief from Settings and invoke its selected provider/model, including the existing subscription Codex provider when selected. |
| AC-15 | P2 / required | When durable PR head differs from the cache head, the system shall mark the saved brief stale; when head changes during inference, it shall preserve the previous cache and require explicit regeneration. |
| AC-16 | P2 | When the focus target has a rendered RIGHT row, the diff shall expand its containers and scroll to that precise row after mounting. |
| AC-17 | P2 | Before the first implementation-code commit, the repository shall contain committed agent-authored spec.md and plan.md; before publication, plan-verifier shall report each requirement as passed or openly unresolved. |
| AC-18 | P2 | Where a different-family model is available for plan review, the process shall record its actual identity and findings; where unavailable, it shall record that limitation without falsely labeling same-family review cross-model. |
| AC-19 | Required | When any brief/context request targets a foreign-workspace PR or repository, or a PR whose parent repo is foreign, the system shall return 404 with zero model/GitHub calls and zero database mutation. |
| AC-20 | Required | When a user saves a relevant text spec through Project Context and reloads, the system shall retain it; when that repository's brief is generated, the saved spec content and path/digest provenance shall be included within budget. |
| AC-21 | Required | When issue/description/Intent/spec data is missing or unavailable, the system shall disclose it explicitly and shall not invent authoritative content or make a compensating model call. |
| AC-22 | Required | While generation is pending, the client shall prevent repeat action and the server shall prevent simultaneous same-PR overwrites; when generation fails, the last successful brief shall remain available with a clear action error. |
| AC-23 | P3 | Where a focus path is only a Blast radius caller, the diff shall show File not in this PR's diff and shall not pretend its indexed line exists in the current PR. |
| AC-24 | P3 | While loading/generating, the interface shall show a useful pending/skeleton state and all added brief/context copy shall use message keys. |
| AC-25 | P3 | Where risk expansion or optional latest-review verdict/score is implemented, it shall reuse existing facts/contracts and shall not add another inference call. |

## Implementation handoff and verification evidence

The implementation-planner must map every criterion to a concrete module/change and validation step, identify optional P3 explicitly, and retain the process limitation if cross-model review is unavailable. Root must commit spec and plan before `run-plan` writes feature code.

Expected server boundaries are `modules/brief/{routes,service,repository}` with pure input-budget/grounding helpers, `modules/context/{routes,service,repository}`, container access for shared repositories/services, matching contracts, and static module registration. Reuse existing fact/provider ports. The narrow PR-detail persistence correction must keep durable SHA/files coherent; do not route the brief through a mutating HTTP GET or fetch new diff source as model input.

Expected client boundaries are PR-local Brief/Intent presentation components, query/mutation hooks in `src/lib/hooks`, page-owned URL navigation, passed diff-focus props, the Project Context editor, and localized strings. Shared diff components must receive target data rather than import the PR page's components.

Meaningful deterministic tests must cover: GET/reload zero calls and zero writes; POST one structured call with selected Settings model and maxRetries zero; valid/invalid mixed risk refs and focus paths; caller-only refs; missing Intent/issue/specs/degraded blast; schema/provider failures preserving cache; byte limits with Unicode/escaping and absence of a sentinel diff body; head stale/race behavior; PR and parent-repo foreign-workspace rejection; context repository isolation and transactional replacement; generation error UI; focus expansion/scroll in grouped and original diff; caller/header fallbacks; cache reload without POST. Use provider spies and database integration where SQL behavior matters. Run affected package typechecks and suites after implementation; do not label mocked output as actual model evidence.

Record one actual Codex-backed generation and explicit regeneration on a suitable test PR with saved specs; show separate recorded request/call counts, measured input bytes, included spec provenance, cached reload, exact-file navigation and SHA freshness. Preserve the actual usage/cost semantics. The demo must show Overview → Generate → summary/risks/focus plus Intent/Blast when available → click focus → reload cached brief → spec/plan/verifier artifacts and one sentence explaining why facts rather than diff code go to the model. Missing fixture inputs stay visible in evidence.

Publication handoff requires a plan-verifier report with each criterion and concrete evidence, the truthful cross-model note, an implementation PR description, and the recorded video. This specification does not certify runtime success, model quality, or completion of those later stages.

## Planner amendment adopted from independent review

The implementation-planner adopted these narrow clarifications on 2026-10-12, with root authorization, before the artifact commit. The existing package review guide is `server/specs/review-contract.md`. The planned minimum attachment UI is the actual `/repos/:repoId/context` page with a visible Overview link.

Baseline pull-list import and polling also advance durable head while retaining old file/body facts. All durable head writers therefore share a scoped PR-row-lock transaction policy: successful detail refresh atomically stores head/files/commits/body/stats; list/poll head change atomically clears old files/commits/body/stats before advancing head, while same-head metadata updates retain facts. Initial brief capture uses the same lock for a coherent immutable PR/file snapshot. Missing detail facts are disclosed explicitly; generation remains allowed from available title/specs with no old changed paths in prompt or allowlist. AC-15 verification includes list/poll advance followed by explicit generation, proving old paths cannot be stamped fresh and no automatic inference occurs.

The existing Codex adapter receives only narrow facts-only enforcement/evidence changes: isolated read-only scratch plus `--ignore-user-config`, `-c features.shell_tool=false`, `-c web_search="disabled"`, no loaded MCP configs/user config edits, and saved per-call prompt/events alongside result/schema. Actual-run evidence checks zero tool/command items and the measured prompt; this does not add a model call or provider. The plan details the corresponding tests and cache-row lock requirements.
