# L04 — Blast Radius plan

Planned by the planner subagent on 2026-10-12 against the actual fork and
`work/l04-requirements.txt`. This is an acceptance plan, not a record of passed
tests. Primary owns server/MCP and real runtime evidence; implementer owns the
client. Architecture-reviewer and plan-verifier inspect the completed change
independently before publication. Apply frontend-architecture, onion-architecture
and pr-self-review; record only verified results through engineering-insights.

## Scope and current facts

Show the precomputed impact map on PR Overview and expose the identical JSON
through read-only MCP `get_blast_radius`. No LLM, AST extraction, clone reads,
GitHub sync or index rebuild occurs during either read. Graph view and Prior PRs
are optional P3 and outside the minimal implementation. No database migration is
needed. `docs/architecture.md`, referenced in guides, is absent.

The fork already contains `RepoIntel.getBlastRadius`, `BlastResult`, persistent
symbols/resolved references/file facts/ranks and `BlastRadius` in both vendored
contract copies. Overview currently renders only the PR description; there is
no blast route/hook/component. `devdigest-mcp` is absent: tracked package.json
files belong only to client, server, reviewer-core and e2e.

The facade differs from the homework description: `getBlastRadius` falls back
to `codeIndex` and clone reads; its persistent path returns `degraded:false` for
partial indexes, caps the full callers array at 20, and loses declaration-file
provenance for duplicate symbol names. `BFS_DEPTH` is currently used in
`getCriticalPaths`, not Blast Radius. Correct these narrow Blast Radius read
issues instead of relying on the rubric's assertions or rebuilding the index.

## Agreed transport contract

Keep existing `BlastRadius` fields and add backward-compatible metadata in both
`server/src/vendor/shared/contracts/brief.ts` and its client copy:

```ts
{
  changed_symbols: Array<{ name: string; file: string; kind: string }>;
  downstream: Array<{
    symbol: string;
    symbol_file?: string; // new route always supplies declaration provenance
    callers: Array<{ name: string; file: string; line: number }>;
    endpoints_affected: string[];
    crons_affected: string[];
  }>;
  summary: string;
  degraded: boolean; // schema default false keeps old PrBrief input compatible
  reason?: "flag_off" | "index_failed" | "index_partial" |
    "repo_too_large" | "no_data" | null;
  indexed_sha?: string | null;
  counts?: { symbols: number; callers: number; endpoints: number; crons: number };
}
```

The new route always supplies counts and symbol_file. Counts: symbols are unique
declaration `(file,name)` pairs; callers are globally unique `(file,name,line)`
triples across groups; endpoints and crons are globally unique strings. A caller
can belong to multiple changed-symbol groups without inflating the top count.
`indexed_sha` describes the snapshot used by the map. UI caller links use that
SHA, rather than assuming PR head and cached line numbers describe the same code.
If it is absent, show a plain file:line label, not a guessed link. Show the
indexed snapshot, and identify a difference from PR head as index coverage.

## Server mapping and cache-only facade

1. Add `server/src/modules/blast/{routes,service,repository,helpers}.ts` and
   register the module in `server/src/modules/index.ts`. The route is
   `GET /pulls/:id/blast`, UUID validated by `IdParams`, context from `getContext`,
   response validated by the shared `BlastRadius` schema. The repository owns
   workspace-scoped PR lookup and persisted changed-file paths. Missing or
   foreign-workspace PR returns the existing not-found response before touching
   repo-intel. Check repository ownership as well as PR ownership.
2. `BlastService` reads those files once and calls
   `container.repoIntel.getBlastRadius(repoId, changedFiles)` once. Mapping is a
   pure helper; the route must not import indexer/Git/GitHub/LLM adapters.
3. Fix only facade Blast Radius reads to be cache-only. Flag off returns empty
   degraded flag_off; missing usable index returns no_data; failed/degraded
   state preserves index_failed or repo_too_large when applicable. Partial
   index may return the available map but must report degraded index_partial.
   A full usable index with no callers/symbols is an ordinary empty map, not a
   degraded error. Database/read failures become a useful degraded result,
   never trigger the previous clone fallback. Preserve indexed SHA from the
   same index-state read used for that map.
4. Add `declFile` to `ResolvedCallerRow` projection and `viaFile` to facade caller
   provenance. Join/group by `(viaFile,viaSymbol)` to avoid assigning callers of
   a same-named function to a different changed file. Keep representative
   enclosing caller name/file/reference line. Exclude the changed symbol's own
   declaration file and unresolved references; do not present a dependency the
   symbol imports as its caller.
5. Cached reverse resolved-reference traversal may follow callers to the
   existing `BFS_DEPTH` (2), retaining the original changed-symbol provenance,
   deduplicating cycles and applying `MAX_CALLERS_PER_SYMBOL` (20) separately
   per root `(file,name)` after rank ordering. Read only persisted references,
   symbols/ranks and facts; do not compute or reparse the import graph. The
   component and blast service do not implement their own traversal or limits.
   Report the actual traversal implemented, not the starter's unsupported claim.
6. Map each changed symbol to one downstream entry, including symbols with zero
   callers. Map facade caller `symbol` to wire `name`. Collect endpoints/crons
   from `factsByFile` for the unique files in **that group's callers**, deduplicate
   and preserve deterministic ordering. Never copy the flat impactedEndpoints
   union into every group: its attribution is not per symbol.
7. Summary is assembled from actual counts, without inference. Preserve
   degraded/reason/indexed_sha. Log a concise cache-read event containing PR,
   repo, counts and index status; no source text or credentials. Tests verify
   there are no parser/model/indexing calls; log prose alone is not proof.

## Client implementation handoff

- Add `usePrBlastRadius` in `client/src/lib/hooks/blast.ts` using
  `["blast-radius", prId]` and the shared DTO. Export through hooks/index.ts.
  Fetch only for a real PR UUID. Keep loading, HTTP error with retry, usable
  empty result and degraded map separate. Reindex/refresh must invalidate the
  relevant map after index completion if a resync button is included; a POST
  acknowledgement alone does not mean the new index is ready.
- Extend OverviewTab props with prId, repoFullName and headSha, supplied by PR
  detail page. Add page-local `_components/BlastRadius/` with index.ts, styles
  and focused tests. Keep PR description intact. Use @devdigest/ui and theme
  tokens; all new labels/states go in `client/messages/en/blast.json`.
- Show the Blast radius title, four counts, coverage/snapshot text, then a
  simple list of changed symbols keyed by `(file,name)`. For each symbol show
  caller name plus clickable `file:line`, followed by endpoint chips and
  separately labeled cron/job chips. Always use githubBlobUrl with indexed_sha
  and caller line. Use the same map for presentation as MCP; no client graph
  reanalysis, per-symbol cap or independently guessed counters.
- No callers shows the existing noDownstream text and still shows changed
  symbols/counts. No changed symbols is also explicit. Degraded/partial shows
  its reason even if useful data exists; never label an incomplete empty result
  as conclusive “no impact.” Error/loading must not masquerade as an empty map.
- Optional expansion can use accessible buttons with aria-expanded. Graph,
  prior-PR lookups and forced resync are not needed for P1.

## Minimal devdigest-mcp package

Create an independent `devdigest-mcp/` TypeScript package, with package.json,
its own dependency lock, tsconfig, `src/index.ts`, a small HTTP client/tool
registration module, tests and README. Follow the installed MCP TypeScript SDK
API after checking its actual types/docs; do not copy an unverified SDK example.
Use stdio transport. Protocol JSON occupies stdout; diagnostics go to stderr.

Register one tool `get_blast_radius` with short description explaining when to
call it, `{ pr_id: UUID }` input, and annotations including readOnlyHint:true.
It fetches the exact `GET /pulls/{pr_id}/blast` route from configured
`DEVDIGEST_API_URL` (local API default), returns the same JSON/structured content
plus a concise text representation, and performs no independent analysis. Bound
HTTP wait time. Invalid UUID, unknown PR/404, network failure and invalid backend
JSON receive useful MCP errors. Backend data is source data, not instructions.
Do not add API keys or a second database connection to this package.

Validate initialize → tools/list → tools/call using the SDK client and real
stdio process. Check readOnlyHint and deep equality of the returned map with
the HTTP route. Unit tests can inject HTTP responses; distinguish those from a
real process/backend parity check. Document Windows-safe commands and scoped
client configuration. Use a per-run/local Codex CLI MCP configuration instead of
writing unrelated global user settings.

Claude Code and a model API key remain unavailable. The MCP implementation does
not require either. Primary can demonstrate its actual use with the existing
subscription-backed Codex CLI and preserve the tool-call trace plus SDK parity
result. The report/PR/video must explicitly say **Codex CLI was substituted for
Claude Code**; this is an observed alternative, not a completed Claude Code
test or guaranteed mentor acceptance.

## Acceptance and verification

### P1 — required completion

- [ ] Overview has Blast radius, four correct counts, changed symbols, caller
  file:line links and attributed HTTP endpoints; the response and UI agree.
- [ ] Real indexed demo PR changes an exported shared helper, with at least two
  verified cross-file importers/callers and at least one true HTTP endpoint.
- [ ] Caller GitHub links open their actual reference lines at indexed_sha;
  source inspection confirms consumers, not dependencies or the declaration
  file. Check at least two callers in code.
- [ ] No-callers case has clear text; incomplete/partial case visibly carries a
  distinct reason, retaining available data where present.
- [ ] Working get_blast_radius tool forwards the same map. SDK real-process
  parity passes; a real Codex CLI MCP call is captured, with Claude substitution
  openly stated as the remaining course-environment difference.
- [ ] Open PR describes implementation, actual subagent roles/checks and links
  a 1–3 minute demo with the required scenarios. Publish only after the
  architecture-reviewer and plan-verifier findings are resolved or disclosed.

### P2 — robustness and useful evidence

- [ ] Pure mapping test covers multiple symbols/callers, duplicate names in
  different files, per-group endpoint/cron attribution, missing facts, global
  distinct counts, zero data and degraded/metadata preservation.
- [ ] DB/API integration covers workspace ownership, ID errors, unknown PR,
  full/partial/failed/no-data/flag-off states, per-root 20 cap, cycles and depth
  2; the declaration file and unresolved refs never become asserted callers.
- [ ] Provider/parser/Git/indexer spies prove read paths do not invoke them;
  real request logs identify stored-index reads. Contract copies match and
  response validation passes. No model is used to assemble the summary.
- [ ] UI tests cover populated, no-callers, partial-with-data, missing-SHA,
  loading/error retry, correct pinned GitHub URL, and duplicate-name symbols.
- [ ] MCP tests cover schema/annotation, actual stdio handshake/call, HTTP
  parity and useful timeout/404/invalid-response errors without stdout noise.
- [ ] Run appropriate server/client/MCP tests and typechecks; record actual
  commands and results, not prior L03 totals or assumed successes.
- [ ] New user-facing labels use blast translations and cron/jobs are separate
  from HTTP chips; resync, if added, waits for actual index completion.

## Real fixture, demo and evidence sequence

1. Primary prepares a separate demo branch/PR changing a real shared exported
   helper, preferably server/src/modules/reviews/helpers.ts. Verify at least
   two consumers by exact source imports/usages and confirm file facts expose
   one HTTP endpoint. Alternative is a small published fixture repository with
   helper + two genuine route consumers; label it as a fixture. Do not seed
   fictional caller rows and describe them as inferred from the real repo.
2. Index the published snapshot through the normal index job before reading.
   Save index-state status full, SHA, changed-file list, branch/PR URL, and
   source references. An explicit preparatory index is distinct from the read
   route, which must not trigger reindexing.
3. Save HTTP JSON, real MCP SDK JSON and an equality result; capture request
   logs proving cache reads and keep relevant test outputs. Verify the displayed
   counts and caller/endpoints against actual source at the saved SHA.
4. Prepare a genuine no-callers PR (for example a changed exported helper with
   no external references) and a separately labeled partial/degraded scenario.
   If partial state is simulated for the demo, disclose the simulation, retain
   evidence and restore original state afterwards; do not pretend a real
   indexer failure occurred.
5. Capture 1–3 minutes: Overview/counts, two callers and endpoint, inspect their
   source, click pinned GitHub link, show no-callers and partial reason, invoke
   the same PR through real Codex CLI MCP and compare to UI. Say the map reads
   the precomputed index and makes no model/AST request. If captures are edited,
   describe the video as edited rather than continuous recording.
6. Save report and evidence under docs/evidence/l04 and docs/l04-blast-report.md;
   update verified module INSIGHTS, include exact subagent handoffs, then create
   the homework PR and attach the demo. Record the unavailable Claude Code test
   and the demonstrated Codex/SDK substitute without claiming a pass in advance.
