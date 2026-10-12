# L05 — PR Why + Risk Brief implementation plan

Status: agent-authored plan; implementation and verification have not started.
Authoring stage: `implementation-planner`, 2026-10-12. Input: this directory's `spec.md`, read after the `spec-creator` stage produced it. Baseline: L04 commit `e7653ab`.

## Delivery order and ownership

This plan implements the supplied specification, including its required byte budget, one structured attempt, ownership checks, durable cache, and minimum saved-spec path. It does not certify that later tests or model runs succeeded.

1. **Artifact gate — root.** Review the agent-authored spec and plan. Obtain an independent plan review, record its actual model identity and findings, and correct material gaps. A different-family model is unavailable in this session; label any available independent same-model review honestly and retain this unresolved P2 process limitation. Commit `specs/l05-pr-brief/spec.md` and `plan.md` together before any implementation agent writes feature code. Record the artifact commit SHA for the verifier and PR description.
2. **Contracts — root, before client implementation.** Extend both vendored `brief.ts` files identically; publish the final schemas/types and their exports to the client run-plan agent. Root owns both contract copies and any necessary shared platform input contract. Client consumes these exports and does not independently redefine or edit the DTOs. No new table, generated migration, lockfile, or provider is planned. The existing Codex adapter receives only the narrow facts-only CLI/evidence changes below.
3. **Server/context/cache implementation — root acting in run-plan stage.** Implement the scoped context module, brief repository and pure helpers, brief service/routes, and the narrow PR-detail transactional persistence correction. Add meaningful server unit/integration tests alongside those changes.
4. **Client implementation — client run-plan agent, after the artifact commit and contract handoff.** Implement context editor/page, brief hooks/presentation, page URL focus navigation, diff target propagation and interaction tests. Root and client may then work concurrently within their disjoint file ownership.
5. **Integration and review — root plus independent reviewer.** Run affected package checks, inspect the combined diff with the repository's pr-self-review instructions, fix verified issues, and record engineering insights only after validation. Reconcile client/server contracts by content comparison.
6. **Actual demonstration and publication — root.** Run actual subscription Codex inference, exercise browser behavior, collect evidence and a 1–3 minute recording, then run the plan-verifier stage. Publish the implementation PR with artifact history, verification report, actual model evidence, video and the truthful review limitation. Do not claim completion of a missing recording, unavailable runtime, model run, or criterion.

| Owner | Planned files/surfaces | Boundary |
| --- | --- | --- |
| Root/contracts | `server/src/vendor/shared/contracts/brief.ts`, identical client copy; shared platform contract only if needed | Owns wire schemas and validation; hands exported types to client before client work |
| Root/server | `server/src/modules/brief/{routes,service,repository,input,grounding,constants}.ts`; `modules/context/{routes,service,repository,helpers}.ts`; module registration and container composition | Routes validate/get workspace, services coordinate ports, repositories own scoped SQL, helpers remain pure |
| Root/server | `server/src/modules/pulls/routes.ts`, `modules/polling/routes.ts`, a shared PR metadata sync repository helper, and `adapters/llm/codex-cli.ts` | Coherent head/detail writes and narrow facts-only Codex flags/evidence; no unrelated review refactor |
| Root/server tests | `server/test/brief-input.test.ts`, `brief-grounding.test.ts`, `brief.it.test.ts`, `context.it.test.ts`, `pulls-detail.it.test.ts`, contract test extension | Real PostgreSQL for scoped writes/transactions/races; spies for external I/O |
| Client run-plan | `client/src/lib/hooks/brief.ts`, context save hook in `core.ts` or a dedicated `context.ts`, hook exports | Typed GET/POST/PUT and cache lifecycle; no data fetching hidden inside presentation helpers |
| Client run-plan | PR `_components/PrBrief/`, `_components/IntentBlock/`, `OverviewTab/`, PR `page.tsx`, `DiffTab/` | Page owns URL changes; presentation receives facts/navigation; Overview retains description and one BlastRadius instance |
| Client run-plan | Shared diff `DiffViewer/`, `RoleGroup/`, `FileCard/`, `CodeLine/`, and small target type/helper if useful | Generic focus props/ref registration; no import from PR-local components |
| Client run-plan | `client/src/app/repos/[repoId]/context/page.tsx`, page-local editor/list component and tests; `messages/en/brief.json`, `context.json` | Saved text specs, truthful capability copy, existing AppShell/UI/theme conventions |
| Root/evidence | `docs/evidence/l05/` and `specs/l05-pr-brief/verification.md` | Sanitized actual observations, review findings and criterion-by-criterion verifier report; no keys/runtime credentials |

Read root/server/client AGENTS and INSIGHTS before edits. Apply `.claude/skills/onion-architecture/SKILL.md` and `frontend-architecture/SKILL.md` to their respective packages. Read the existing `server/specs/review-contract.md` and client/e2e equivalents in their package context; use actual contract code rather than inventing a root document.

## Public contracts and endpoint behavior

Root publishes Zod schemas and inferred exported types for `ReviewFocus`, strict generated output, validated cache document and the response envelope. Keep existing `Risk`, `Risks`, `Intent`, `BlastRadius`, and `PrHistory` conventions. The generated response and cache are distinct schemas:

```text
Generated output, strict:
{ summary: nonempty string <= 1600 chars,
  risks: bounded Risk[] (<= 8),
  review_focus: [{file: nonempty string, line: positive integer,
                  reason: nonempty string <= 1024 chars}] (<= 8) }

Saved PrBrief:
{ version: 1, head_sha: nonempty string, generated_at: ISO date string,
  summary, review_focus,
  intent: Intent | null, blast: BlastRadius | null,
  risks: {risks: Risk[]}, history: {history: []},
  provenance: validated input status/count/truncation/spec digest metadata,
  generation: validated actual provider/model/call/attempt/usage/budget metadata }

Brief response, GET and successful POST:
{ brief: PrBrief | null, current_head_sha: nonempty string, stale: boolean }
```

Risk fields remain `kind`, `title`, `explanation`, `severity: high|medium|low`, and `file_refs`. Root bounds nonempty title/explanation/kind/ref strings to practical lengths and requires a nonempty reference array in generated output. Grounding may remove risks entirely. Neither a valid empty risk array nor empty focus array needs a fabricated replacement.

Provenance uses the spec's `available|missing|unavailable` statuses and authoritative source strings. Record description, Intent, Blast radius, issue, diff-stat and attached-spec status explicitly; record indexed SHA separately from captured PR head, Intent SHA coverage as unknown, truncation flags/counts, and included spec path/digest/original/included bytes. Root makes these fields concrete in the vendored schema before client uses them. Generation metadata includes actual provider/model, application structured call count, returned attempts, actual tokens/cost, discarded reference/item counts and these exact budget field names: `measured_payload_bytes`, `adapter_framing_allowance_bytes`, `budgeted_input_bytes`, `input_budget_bytes`, `budget_unit`.

| Endpoint | Success | Failure/side-effect contract |
| --- | --- | --- |
| `GET /pulls/:id/brief` | 200 response envelope; no cache gives `brief:null, stale:false` | UUID validation uses existing route schema; foreign/missing PR or parent repo 404; no writes/external work; invalid legacy JSON returns unavailable/null with diagnostic and client Generate state |
| `POST /pulls/:id/brief` | Empty body accepted; 200 response envelope containing the newly saved brief | Competing generation 409 `brief_generation_in_progress`; changed head 409 `brief_head_changed`; provider/schema/budget/DB failures return existing API error shape and preserve old cache; no automatic retry |
| `GET /repos/:id/context` | 200 `SpecFile[]`, source=`spec` only, content and UTF-8 `size`, `updated_at:null` | Foreign/missing parent repo 404 before reads with side effects; no model/index/Git/filesystem work |
| `PUT /repos/:id/context` | `{path,content}` saves/replaces one entry, returns 200 saved `SpecFile` | Invalid logical path/empty or >65536-byte content 422; foreign/missing parent repo 404; transaction prevents ambiguous same-path duplicates |

Use the existing `{error:{code,message,details}}` API error envelope. Do not add a reindex endpoint merely to satisfy old scaffolding. The client imports the root-published brief response schema/type and existing `SpecFile`; no parallel local interface is permitted.

## Server sequence

### 1. Minimum durable Project Context

Implement `ContextRepository` with scoped parent lookup and spec-only list/save. Select rows by workspace ID, repo ID and source=`spec`, stable path then ID order. List deduplicates any legacy same-path rows deterministically; save replaces matching spec rows transactionally and retains code/docs rows at the same path. Use a repository-scoped PostgreSQL transaction advisory lock, since `code_chunks` has no unique path constraint. Lock, revalidate parent ownership, delete matching source=`spec` rows, insert one saved spec with embedding null, and return its content byte size. Do not invent an update timestamp.

Validate nonempty repository-relative POSIX logical paths, at most 256 characters: reject absolute/drive paths, backslashes, controls, empty path segments, `.` and `..`. Follow the spec's logical-text-name rule; do not introduce an undocumented extension restriction. Validate content by UTF-8 bytes, not JavaScript length. These names are not filesystem paths and must never be opened on disk.

`ContextService` exposes the same scoped read for GET and BriefService. Register the context plugin in `modules/index.ts` and shared service/repository composition through the container as needed. No embeddings, parser, index, Git or provider calls occur.

Baseline audit found `codeChunks` only in schema exports/definition; repo-intel full/incremental writes touch symbols/references/edges/ranks/maps/facts, not code_chunks. Therefore no indexer change is planned. Add a preservation check with a saved spec and code/docs rows; verify the actual index path used by the demo does not remove the attachment. If implementation discovers another bulk replacement writer, constrain it to code/docs and prove source=`spec` preservation before continuing.

### 2. Coherent PR detail persistence

Keep the existing live GET `/pulls/:id` behavior but verify the parent repo workspace. On successful GitHub detail fetch, lock the scoped PR row and put `pr_files` replacement, `pr_commits` replacement and durable PR body/headSha/stats (and the existing refreshed metadata as appropriate) in one transaction. Persist the returned `head_sha`; do not leave durable head at the previously listed commit. Recheck scope inside the write transaction and avoid partially deleting rows if insertion/update fails. Offline/fetch failure still serves the prior durable snapshot. BriefService never invokes this mutating GET and never fetches a fresh diff/source for inference.

Every other durable head writer (pull-list import and manual polling) uses one shared metadata-sync repository helper with a transaction and the same PR-row lock. If head changes, atomically clear the old `pr_files`, `pr_commits`, PR body and diff statistics before advancing head; same-head metadata updates retain those facts. Generation can then proceed from available title/Intent/specs with explicit missing file/body provenance and no old file paths. Successful detail refresh atomically restores current head/files/body/stats. No new detail-head column is required.

Tests prove success stores returned SHA/files/stats/commits, failed transactions retain prior state, same-head import retains facts, and list/poll head advance clears old paths before generation. The old brief becomes stale with no automatic model call; an explicit POST must never send/allowlist the old file paths. Evidence identifies the actual imported snapshot rather than claiming an unobserved remote commit.

### 3. Scoped brief repository and fact capture

`BriefRepository` scopes cache reads/writes through both PR.workspaceId and parent repo.workspaceId. Fetch one immutable capture of PR metadata/head, persisted file rows, Intent and specs after ownership checks in a transaction holding the same PR-row lock as all head/detail writers; release it before inference. Dependent ID-only existing helpers are only used after ownership checks. Prefer scoped repository projections for new SQL. GET loads only scoped head/cache, safe-parses JSON and computes `stale = brief.head_sha !== current_head_sha`; it neither builds generation inputs nor calls the fact adapters.

BriefService snapshots facts before inference. Reuse the existing pure Smart Diff `classifyFile` and `ROLE_ORDER`. Reuse the persisted repo-intel port and existing Blast radius mapping with captured file paths; avoid rereading a different changed-file set after capture (`BlastService.forPull` currently returns `{repoId, document}`). Keep partial maps/callers and indexed SHA with truthful reason. Do not run refreshIndex, codeIndex, Git, source loading, embeddings or an Intent completion.

Resolve the same first supported `#number` body reference used by Octokit; explicit POST may call `container.github().getIssue` for that captured reference. Report `not_linked`/missing or unavailable on offline/config/network errors. GET does not resolve an issue. Issue failure reduces facts rather than making a fallback model call.

### 4. Pure input and grounding helpers

In `brief/input.ts`, build an explicit scalar/numeric whitelist. Never spread PR rows, PrDetail, file objects, patch, pseudocode, review findings or code bodies into the prompt. Locally read hunk headers only to extract positive new-side starts with nonzero new count (maximum four per changed file); include numeric anchors only. Caller lines remain index facts. Keep the full authoritative path union outside the bounded prompt representation.

Sort files by role order/path, callers by file/line/name, specs by path/ID. Enforce serialized section ceilings: PR title/body 4600, issue 2500, Intent 2000, blast 3400, files/roles/anchors 5500, specs 8000 UTF-8 bytes. Include at most eight specs and 64 callers; preserve original/included/omitted counts. At least one saved nonempty spec contributes a prefix when it fits. SHA-256 digest records the original saved content.

Trim Unicode at code-point boundaries; account for JSON escaping and metadata after serialization. Use the prescribed reduction order: extra spec entries/tails, PR body tail, issue body tail, caller tail, extra file entries, Intent lists/text tails. Measure compact serialized exact `{messages,schemaName,jsonSchema}` plus 1024-byte labeled framing allowance, including system text and schema. Assert total <=32000 immediately before inference. If fixed framing alone cannot fit, return a clear budget error before calling the model. Do not use the tokenizer or a second summarization call.

System instruction frames all supplied prose as untrusted evidence and disallows instructions/tool/source access in it. `grounding.ts` validates exact POSIX identities against captured changed paths plus `blast.downstream[].callers[].file`. Trim neither traversal nor guessed paths into legitimate names. Remove invalid risk refs, discard ref-empty risks and unknown-path focus items, deduplicate refs/items preserving model focus order, and report discard counts. Do not expand the allowlist with specs, endpoints, declared symbols outside changed paths or generic indexed files.

### 5. Single inference, safe cache replacement and observability

Construct BriefService once per application/container and use an app/process-shared in-flight Set keyed by workspace+PR, shared even if another service instance is constructed. Ownership validation precedes dependent I/O; an already active key returns 409 without another completion. Release the key in `finally` on success and failure. This is the specified single-server deployment guard, not a multi-instance lock claim.

Resolve `risk_brief` with `resolveFeatureModel`, then `container.llm(choice.provider)`. Invoke `completeStructured` exactly once with the strict generated-output schema, stable schemaName, selected model and `maxRetries:0`; use the adapter's existing bounded timeout. Do not invoke complete/review/Intent/map-reduce/fallback/embedding paths. Safe-parse output even for test providers. Reject returned `attempts !== 1`, preserve old cache and expose an error instead of hiding a reprompt.

After validation/grounding, compose and validate the cache document. Within a transaction lock/recheck the scoped PR row and current head, and conditionally upsert only if head matches the capture. If head moved, return 409 `brief_head_changed` and preserve the prior cache. Keep previous cache on every earlier error. SQL scoping must remain correct for malformed parent workspace relations and competing head updates.

Log sanitized generation metadata: PR ID/captured head, selected provider/model, call count, attempts, measured budget values, source statuses, included spec paths/digests/counts, grounding discards, actual tokens and nullable cost. Do not create review `agent_runs` rows for this feature. Record one application structured attempt separately from any provider transport retry behavior; never assert one network request across all adapters.

### 6. Narrow Codex facts-only enforcement and evidence

Keep the existing isolated read-only scratch/login path. Add already verified CLI flags `--ignore-user-config`, `-c features.shell_tool=false`, and `-c web_search="disabled"`, with no MCP config loading or user config modification. Persist per-call `prompt.txt` and `events.jsonl` beside existing result/schema files for input and zero-tool evidence. Verify args with adapter tests and the actual event stream has zero tool/command items. Use the same JSON-schema conversion as the adapter when measuring the exact envelope. This narrowly enforces facts-only inference and evidence; it does not add another completion or provider.

## Client sequence

1. Add `usePrBrief(prId)` GET and explicit `useGeneratePrBrief(prId)` POST hooks. Key query by PR identity, disable until UUID exists, update cached envelope on success and retain previous data on mutation error. Invalidate brief data when durable PR head/detail changes, including repository refresh, without POST. No effects/focus/reload handlers generate. Pending mutation disables Generate/Regenerate.
2. Add context PUT mutation alongside existing `useContextFiles`; success replaces/invalidates the repository list. Implement `/repos/[repoId]/context` with existing AppShell, list, path/content editor, Save/Edit, pending/error/empty/reload states. Link from Overview so the actual route is discoverable. Replace copy promising .devdigest folder watching/every-agent retrieval with truthful saved-text-to-brief copy.
3. Add PR-local `PrBrief` and `IntentBlock` with index exports. Overview retains PR description, renders a labeled PR Brief region, Generate/Regenerate, summary, severity/title/file refs/explanations, ordered focus buttons/links and deterministic provenance gaps. Keep the existing BlastRadius component adjacent within this region exactly once, plus its coverage/degradation messages. Stale cached content remains visible; GET error and mutation error are separate recoverable states. Invalid/absent cache has the Generate state. Include useful loading/pending state and empty risks/focus copy.
4. PR page parses `file` and positive `line` query values and passes a generic focus target into DiffTab. Focus activation atomically updates `tab=diff`, `file`, `line` with URLSearchParams, preserving unrelated parameters. Refactor the existing tab setter only as needed. Direct URL and reload retain the target.
5. DiffTab/Viewer passes the focus target through grouped and original rendering. RoleGroup and FileCard expand on target change/mount even when defaults collapse docs/boilerplate or large files. Existing drafts remain owned above mode remounts. Register file/header and RIGHT-row element refs; scroll after group/file mount to exact RIGHT row, otherwise its header. Do not construct unsafe selectors from paths. Keep focus distinct from comment/finding state.
6. A target not in changed files shows `File not in this PR's diff`; caller-only paths retain indexed snapshot explanation. A changed file without the target RIGHT row opens its header and shows a line-not-displayed notice. Support keyboard activation and repeated navigation to a target, grouped/original mode changes, Unicode/special-character paths, and normal user expansion after the target is handled.
7. Put all new labels/states in `messages/en/brief.json` and context namespace. Use existing `@devdigest/ui` and theme variables. Explanations may be visible directly; optional VerdictBanner/score and risk-click navigation are not needed to deliver required behavior.

## Test and runtime verification plan

Tests are implementation work after the artifact gate. Fixtures use actual API/cache contracts; mocked provider output is labeled deterministic evidence, separate from the actual model generation.

| Suite | Meaningful assertions |
| --- | --- |
| `brief-input.test.ts` | Multibyte/emoji/non-Latin prefix safety, JSON quotes/backslashes/control escaping overhead, many files/callers/specs, exact 32000-byte enforcement and metrics, fixed-envelope failure before inference, deterministic selection/omission/digest, nonempty first spec prefix, numeric anchors only |
| `brief-grounding.test.ts` | Mixed valid/invalid refs, unknown/traversal/absolute paths, allowed changed and caller-only paths, excluded spec/endpoint/declaration-only paths, ref-empty risk removal, stable focus order/dedup, positive line contract, valid empty arrays |
| `brief.it.test.ts` | GET no cache/cache/invalid legacy/stale head with zero writes/model/GitHub/index/parser/Git calls; POST selected Settings provider/model once with maxRetries=0, attempts=1; sentinel patch/body never in requests; missing inputs and partial blast; success persistence/reload; malformed output/provider/attempts>1/DB failure preserves cache; head race 409 and previous cache retained; second concurrent POST409 without extra call; no fake agent_runs |
| Scope cases in brief/context integration | Missing/foreign PR, foreign repo, same-workspace PR with foreign parent repo all 404 with zero provider/GitHub calls or writes; workspace-scoped spec read; foreign rows cannot affect allowlist/cache/provenance |
| `context.it.test.ts` | UTF-8 size, logical path and content validation, GET read-only, reload persistence, deterministic duplicate handling, concurrent same-path saves yield one unambiguous spec, code/docs same path retained, parent ownership checks, no model/embed/index/filesystem calls |
| `pulls-detail.it.test.ts` | Mock live detail writes head/body/stats/files/commits as one transaction; failed replacement preserves old state; parent workspace rejected; offline path serves persisted state; list/poll head advance clears old paths/body/stats, marks old cache stale and never invokes inference except explicit POST; same-head sync retains facts |
| Contract/adapter tests | Both vendored contracts match; generated/cache/response parse valid objects and reject missing summary/focus/invalid line/invalid provenance; legacy cache is not treated as fresh valid output; narrow CLI flags and saved prompt/events verified |
| Brief UI/hook tests | Generate initial state, saved rendering, severity/file/reason labels, explicit missing/partial facts, pending disabled action, stale retained card, POST failure retains success, reload GET without POST, Regenerate updates cache once, settings/spec changes don't auto-generate |
| Context UI tests | Save/reload/Edit, validation/pending/error/empty states, repository-scoped query/mutation, truthful copy and link from Overview |
| Diff interaction tests | Page query preserves unrelated fields; grouped collapsed role and large file expand; original mode expands; exact RIGHT scroll ref used; direct URL/reload; missing line header fallback; caller not in diff; special-character paths; existing findings/comments/drafts/mode switch tests continue passing |

Run server `pnpm typecheck` and configured unit suite; run PostgreSQL integration suites with the available Docker runtime, then the full server suite if supported. Run client `pnpm typecheck` and `pnpm test`. Run e2e `npm run typecheck` if its journey/evidence code changes. If Docker/CDP/Unix launcher is unavailable, explicitly record skipped checks and use the existing running Windows API/UI plus CUA for browser verification; do not claim the Unix hermetic runner passed. Repeat checks after substantive fixes, not merely for elapsed time.

### Actual model and browser evidence

Use the suitable actual imported/scoped test PR10 with risky config/helper/dependency changes and persisted file metadata. Attach `specs/l04-blast-radius.md` through the UI, optionally the L05 spec within budget, reload Project Context to prove durability, and configure Settings Risk Brief to the working subscription Codex provider. Preserve actual unavailable/missing inputs; do not replace them with a seeded claim of real inference.

1. Record initial scoped head and absence of valid cache, then open Overview and show Generate.
2. Generate once through the actual API/UI; capture sanitized request/response, actual resolved provider/model, application call count/attempts, exact budget measurements, spec provenance and usage. Inspect saved prompt and CLI events: no patch sentinel/code bodies sent and zero tool/command items.
3. Show generated what/why summary, risks/title/file/severity, ordered focus and adjacent Intent/Blast or explicit gaps. Activate a changed-file focus item and observe `?tab=diff&file=...&line=...`, expanded containers, and exact RIGHT row or truthful header fallback.
4. Reload/revisit Overview; compare cached JSON/generated_at and show zero new POST/completion. GET may repeat, inference must not.
5. Explicitly Regenerate and capture exactly one additional completion/new generated_at. Show pending action prevents double-click and errors retain last result where practical.
6. Introduce/observe a different durable head using the actual imported refresh path or a clearly labeled scoped test fixture. Confirm the old card is stale and no automatic completion occurs. Deterministic integration proves the mid-generation head race; do not call a fixture head change a real remote commit.
7. Verify saved attachment remains after the actual index/refresh path exercised. Record actual browser observations, dimensions/runtime and screenshots/recording separate from fixture tests.

Record a 1–3 minute video showing Overview → Generate → summary/risks/focus and available Intent/Blast → click focus → cached reload → spec/plan/verifier artifacts. Explain in one sentence that precomputed facts limit cost and avoid sending diff code. Link the recording in the PR; if recording/export is unavailable, leave AC-09 openly unresolved until a playable deliverable exists.

## EARS traceability and completion gates

| Spec ID | Implementation location | Required evidence |
| --- | --- | --- |
| AC-01 | Overview/PrBrief GET state | Initial-state UI test and browser Generate |
| AC-02 | BriefService + PrBrief | Valid response integration/UI and actual generated card |
| AC-03 | Fact provenance + IntentBlock + existing BlastRadius | Missing/partial/available fixtures plus truthful actual card |
| AC-04 | Generated schema/grounding + cards/list | Contract/grounding tests and rendered refs/positive lines/reasons |
| AC-05 | grounding helper captured union | Adversarial unknown/ref-mixed test and persisted result |
| AC-06 | PR page URL + diff focus props | Grouped/original expansion tests and browser file navigation |
| AC-07 | Read-only GET/cache + GET hook | Zero-call/write integration and cached browser reload |
| AC-08 | Explicit POST hook + safe upsert | Regeneration integration and one additional actual call |
| AC-09 | Published implementation PR/video | PR contains agent artifacts, description and playable 1–3 minute recording |
| AC-10 | BriefService single completion | Spy maxRetries=0/call1, reject attempts>1, actual sanitized logs |
| AC-11 | Input helper/final assertion | Unicode/escaping/oversize tests and measured actual input metrics |
| AC-12 | Explicit projections/numeric anchors | Sentinel request assertion, inspection and actual input evidence |
| AC-13 | Matching shared schemas/cache safe-parse | Contract parity/typechecks, valid/legacy response tests |
| AC-14 | Settings resolver/container port | Selected alternate model/provider spy and actual Codex setting/output |
| AC-15 | PR-detail transaction + stale GET + conditional upsert | Durable detail tests, head-race test and browser stale evidence |
| AC-16 | File/RIGHT-row refs/expansion | Exact-row scroll interaction and browser observation |
| AC-17 | Artifact gate + plan-verifier | Git history proves earlier artifact commit; verification report links each result |
| AC-18 | Independent review note | Actual model identity/findings; different-family unavailable explicitly retained |
| AC-19 | Scoped repositories/ownership preflight | PR/parent/context foreign-scope fixtures with zero calls/writes |
| AC-20 | Context page/API + fact provenance | Save/reload/concurrent/scoped tests, actual saved spec content/digest |
| AC-21 | Provenance status/missing notice | Missing/unavailable fixture tests and actual gaps retained |
| AC-22 | Disabled mutation + in-flight guard/error retention | UI and concurrent/error/cache/head-race integration tests |
| AC-23 | Diff caller-only fallback | Caller-only test and message; implemented P3 support |
| AC-24 | Localized loading/pending/context states | UI states/message keys and browser pending; implemented P3 support |
| AC-25 | Direct risk explanation; optional latest verdict deferred | If explanation is shown, UI test proves saved data only; VerdictBanner/score remains optional |

The verifier reports **passed**, **failed**, **not run**, or **unresolved** with file/test/evidence references for every row. It must distinguish deterministic contract evidence, actual provider evidence and browser evidence. Same-model independent review does not pass the different-family portion by relabeling it; the availability branch/limitation must be explicit. PR history, optional verdict/score, workflow-retro and cost-report are deferred P3 and do not block required code behavior.

Before publication, inspect `git diff --check`, contract equality, tests/typechecks, artifact-before-code history, sanitized logs, current cache/head behavior and the playable video. Root adds the final verification report and PR description with a factual before/after behavior explanation and actual checks; no credentials or local runtime files enter commits.
