# Development harness evals

This self-contained Node 22 package adapts the official L06 eval structure to
the user's subscribed Codex CLI. It has Skill, Agent and workflow cases, a
blocking static gate, raw-event scoring and repeated/delta/benchmark reports.
It uses no Claude SDK, API key, proxy, embedding service or model judge.
The existing product Evals UI and `pnpm verify:l06` remain separate.

Install and run deterministic checks from `evals/`:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run eval:quality
npm run eval:skills
npm run eval:agents
npm run eval:workflow
```

Every command above makes **zero inference calls**. Tests use synthetic JSON
events and disposable files, explicitly proving parser/scorer mechanics rather
than real model behavior. `eval:quality` validates all local Skill metadata,
eleven agent definitions, authored-Skill links, all case sources and CLAUDE
routing. The full development-role permission audit remains the repository's
`node scripts/check-development-agents.mjs` gate.

## Explicit live trials

Install a recent native Codex CLI and sign in separately with the ChatGPT
subscription (`codex login`). Do not supply an API key. The adapter checks
`login status` for ChatGPT and rejects API-key auth. Set `CODEX_CLI_PATH` to the
native executable when `codex` is not on PATH; versioned desktop install paths
are deliberately absent from committed code. Set the exact accessible
`EVAL_MODEL`; the harness never guesses or substitutes a model.

PowerShell example (root owns live evidence in the current course plan):

```powershell
$env:CODEX_CLI_PATH = 'C:\path\to\codex.exe'
$env:EVAL_MODEL = 'your-accessible-model-id'
npm run eval:doctor
$env:EVAL_LIVE = '1'
npm run eval:live -- --suite skills --case insights-positive --label first
npm run eval:repeat -- --case architecture-defect --count 3 --label candidate-v1
npm run eval:benchmark -- --case architecture-defect --count 2 --label artifact-ab
npm run eval:delta -- --before candidate-v1 --after candidate-v2
```

Strict isolation is the default. On this Windows executor it fails closed.
The root explicitly authorized a narrower mode for nonsecret staged coursework
fixtures: append `--isolation mcp-readonly` to doctor/live/repeat/benchmark.
For example, after separately setting the live/model gates:

```sh
npm run eval:doctor -- --isolation mcp-readonly
npm run eval:live -- --case runtime-write-canary --label safety-probe --isolation mcp-readonly
```

This mode does not claim OS read isolation or network denial. Inspect the raw
canary tool events: host-observed file absence alone does not prove a write tool
was exposed or attempted a write. The default never silently falls back.

POSIX shells use `EVAL_LIVE=1 EVAL_MODEL=... CODEX_CLI_PATH=... npm run ...`.
`eval:doctor` performs no inference: it checks CLI availability/auth status and
executes a fixed physical-sandbox probe. A failed doctor/preflight blocks trials.
Live commands require both env gates and a report label; default concurrency is
1 (allowed 1–2), trial timeout 120 seconds (1–300 seconds), repeat count 1–5,
maximum 24 trials/invocation and captured stdout+stderr at most 8 MiB/process.
Process trees are terminated on timeout/overflow. Partial evidence and failures
remain recorded; no retry silently replaces a failed trial.

## Safety and runtime translation

The host stages only case-allowlisted files, rejecting links, unsafe paths and
files over 128 KiB; each snapshot is at most 1 MiB. It lives in a fresh system
temporary directory outside the checkout, avoiding ancestor project config.
The CLI runs without its daemon, user config, execpolicy rules, shell, local
image reads, hooks, apps, plugins, browser/computer use or web search. Its only
repository data surface is a fixed stdio MCP exposing `list_documents` and
`read_document(path)`. It checks the staged manifest, canonical paths, every
ancestor, regular files, SHA-256 identity and a bounded 128 KiB read. It exposes
no command, arbitrary enumeration, URL, environment or write tool. The server
clears its inherited environment immediately. Native subagents inherit the
same tools and restrictions.

The native Code Mode orchestration host is enabled because this CLI needs it to
expose MCP tools. Code Mode itself stays disabled, as do shell/image/app/hook/
browser/plugin/web surfaces. The no-model feature check verifies that distinction;
it does not prove host availability or which tools a live model sees. Completed
runtime error items remain failures even when the CLI later completes a turn.
Missing host support is a failed trial, not permission to install a binary or
enable a general execution/data interface.

A custom physical permission profile grants **read** access, with command network
disabled and approval policy `never`. Strict mode requires minimal OS + snapshot
reads and a successful OS read/network probe. Explicit Windows `mcp-readonly`
uses the backend's required `:root` reads, restricting data through the fixed MCP
while general shell/image tools remain disabled.
Physical writes remain forbidden. There is no sandbox bypass or writable
project root. Both modes require a physical denied-write canary and rejected MCP
absolute/traversal/junction/oversize canaries. Strict mode additionally requires
denied OS outside reads and loopback networking to a live host listener. The
explicit fallback records those unsupported OS claims and their actual probe
results separately; it never relabels a strict failure as success.

The main CLI retains its own authentication environment; the harness never
opens or copies credentials. Both host-child env and model-shell env use
allowlists. Model shells use `inherit=none` and a scratch HOME/CODEX_HOME/temp,
without API keys, tokens, auth paths or proxy credentials. The fixed MCP can
only read its staged allowlist and cannot open the parent's auth files. The
inference transport itself needs service connectivity; disabled networking
refers to model-generated tools, not authentication/inference transport.

Source `.claude/skills/<name>/SKILL.md` is mirrored into native
`.agents/skills/<name>/SKILL.md` for activation cases. Agent content cases inject
the real role body; delegation cases translate it into a native
`.codex/agents/<name>.toml`, inheriting the parent's restrictions. Read/Glob/Grep
are represented by fixed scoped MCP tools, because Codex CLI and
Claude use different tool surfaces. These are explicit Codex adaptations, not
claims of native Claude behavior. Only one child may be concurrent; the prompt
forbids nested delegation and the entire trial remains timeout-bounded.

## What the scores mean

`cases.json` includes real positive/near-miss negative Skill activation,
architecture defects and a benign control, CLAUDE documentation routing and a
named delegation scenario. Synthetic diffs live under `fixtures/`; they are
never applied. The final structured JSON response is the proposed artifact.
The sandbox prohibits writing proposed insights/reports to project files.

Source reads count only when an actual successful `mcp_tool_call` from
`eval_files.read_document` returns the requested staged path and exact host
SHA-256/byte identity. The parser also understands historical fixed-helper command
events, but the live runtime disables model shell. Other command strings remain
raw evidence and are not guessed to be successful reads. Skill activation means
an observed Skill-body read through this channel, not a claimed Skill tool call. The negative
control additionally requires zero tool calls, so an uncredited shell read
cannot pass silently. The parser counts actual emitted `collab_tool_call` spawn
events, never promises in prose. Missing named-role metadata fails that named
assertion and remains unknown. A complete recognized root event stream, including
terminal events for every started tool, can establish zero **emitted root** tool
or spawn calls without inventing a collaboration event. Unknown item/operation
types, unfinished tools/turns and malformed streams make absence checks
unverifiable and action counts null. Failed spawn attempts still count as root
spawn calls; a named-delegate assertion requires an actual successful role event.
Descendant-internal actions and collaboration capability metadata remain unknown.

Rubrics are deterministic, narrow checks of source reads, exact cited snippets,
verdicts and finding counts. The positive Insights case also requires a structured
`proposedInsight` with a valid date, specific discovery and practical consequence,
actual source path/line/expression and supported verification provenance. Its
prompt reports deterministic-fixture verification without an exact command or
count, so the proposal must attribute that user report and leave `command` null.
Verification concepts are checked across its evidence and result fields, allowing
an accurate third-person paraphrase rather than requiring an exact first-person
quote or repeating every word in both fields. Invented counts in either field,
fresh test-execution claims, unsupported provenance and commands still fail.
Empty/generic PASS responses and invented test observations cannot satisfy it.
The live JSON schema requires nullable `proposedInsight`; unrelated cases use
null. Old unrelated records without this field remain readable.
These rubrics do not certify comprehensive review quality.
Native automatic instruction-loading is not separately observable as a read;
the routing cases explicitly request MCP reads. Descendant-internal reads
not emitted by the root CLI are unknown. Root `turn.completed` usage is retained
without claiming whether nested usage is included.

The documentation-routing case explicitly defines PASS as completion of its
requested reads and boundary/constraint summary, not successful test execution
or a passing harness score. It requires the product-versus-harness distinction,
core/I/O/grounding constraints and nullable persisted cost/evidence provenance;
reads plus an empty/generic answer cannot pass. REVIEW remains a failing result
for this complete-routing expectation and is never accepted globally.

The onion case keeps its required I/O and output-grounding evidence and FAIL
verdict. Only the candidate receives an extra checklist to inspect both incoming
I/O/secrets and outgoing grounding/validation. Its baseline prompt and the shared
repository Skill/agent profiles are unchanged. This deterministic prompt check
does not prove that a new model answer will find the missed grounding defect.

The preserved `course-live-v1` trial set has four passes and four failures. Those
historical scores and raw records are not rewritten by these rubric/prompt
changes. The actual user-report paraphrase is a deterministic regression fixture,
not a retroactively passing live trial.

The delegation failure's stderr reports `collab spawn failed` and `no rollout
found`; no successful named spawn/result was observed. As a bounded compatibility
experiment, only explicit delegation cases now omit `--ephemeral` so the native
CLI can retain the parent rollout context in its own thread store. Every other
case remains ephemeral, and all physical permissions, tool restrictions, auth
handling and deadlines stay in force. This is an **unproven hypothesis** until a
new root-owned live trial emits a successful named spawn and grounded child
result. Retained CLI session state is not copied into the staged snapshot or
reported as proof of delegation. The old failed attempt remains failed.

## Evidence and reports

Ignored `results/records.jsonl` stores every live attempt, including blocked
preflight and failed trials. Each run directory retains exact prompt, staged
source/config copies and SHA/byte manifest, CLI JSONL, stderr, final output,
parsed trace, sandbox probe and record. No auth files are copied. Inspect raw
evidence before publishing it. Default CI only handles synthetic/static checks.

Reports retain total/passed/failed/blocked trials, pass rate, measured/unknown
sample counts, means, sample standard deviations and failure details. Missing
usage remains null; subscription billed USD is always null with a reason.
New action counters declare `toolCallsScope: emitted_root_tool_calls` and
`delegationsScope: emitted_root_spawn_calls`. Complete-root zeros are measured
within that scope; incomplete counts remain null. Readers/reports treat legacy
action values without matching scope as unknown and never aggregate them into
root or global totals. Parsed traces retain the explicit root-stream provenance;
these counters make no claim about hidden descendant activity.
Cache ratio names the compatible measured input-token denominator and is null
when any selected trial lacks either counter. Delta requires the same model,
case set and isolation mode; it is descriptive, not a significance test. Benchmark removes only the
target artifact, preserving other sources; inspect manifests to assess whether
the contrast discriminates rather than assuming every task shows a lift.

Three GitHub workflows block on static quality and deterministic suites.
Subscribed live jobs require explicit manual dispatch on the default branch,
`run_live=true`, repository variable `CODEX_EVALS_SELF_HOSTED=true` and a trusted
self-hosted runner labeled `codex-evals` with its own prior subscription login.
No fork secrets or hosted-runner login are assumed. Missing auth/sandbox support
produces blocked records and a nonzero job; an unconfigured manual live job is
skipped and proves no model behavior. Set `CODEX_CLI_PATH` as a repository variable
only if needed on that trusted runner. CI artifact upload is future workflow
behavior, not authorization to submit course material during the current hold.

Verified command/config references: [non-interactive JSON events](https://learn.chatgpt.com/docs/non-interactive-mode),
[permission/environment configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[native custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
The installed CLI's own `exec --help` and `sandbox --help` were also inspected.
No live run is implied by the deterministic package checks.

Observed Windows limitation (2026-10-16, CLI 0.162.0-alpha.17.2): ChatGPT login
status was confirmed without reading credentials. Snapshot-only reads were
unsupported by the elevated backend; native MXC was unavailable. With root-read
and the scoped MCP fallback, the fixed physical probe proved writes denied but
found loopback connectivity despite `network.enabled=false`. Strict doctor fails
closed. The root-authorized explicit `mcp-readonly` doctor passed physical-write
and all four MCP data-canary checks, recording OS read/network limitations.
Those doctor checks performed no inference and establish no no-network platform
claim; subsequent live trial evidence is separate.
Independent apply-patch tool-disable telemetry is also not exposed by these
no-model CLI checks; physical write denial is measured separately. Do not turn
these unresolved runtime limits into a successful live evaluation.
