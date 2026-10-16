# L06 development-harness eval follow-up

16 October 2026. The self-contained `evals/` package evaluates the development
Skills, agent behavior and workflow routing. It is separate from product Agent
Evals, which evaluates stored PR findings. `CLAUDE.md` now routes both correctly.

Eight authored cases cover Insights positive/negative activation, onion boundary
review, unsafe/benign architecture review, documentation routing, named delegation
and a write canary. Three CI workflows run deterministic skill/agent/workflow
gates without inference. Real subscribed Codex trials require explicit opt-in;
manual live CI needs an appropriately authenticated self-hosted runner. No API
key or model call is required by ordinary PR CI.

## Verification and real outcomes

Final root `npm test`: **29/29 passed, zero skips**. TypeScript build/typecheck
passed, and `npm run eval:quality` reported **16 Skills, 11 agents, 8 cases and
zero findings**. This establishes harness mechanics, not perfect model behavior.

[Retained actual model results](evidence/course-labs-completion/harness-live-results.json)
include twenty original records, usage, failed assertions and raw-output digests.
Configured model was `gpt-6.1-sol`; backend-resolved identity and billed USD are
unavailable. Counters explicitly cover emitted root CLI events; descendant totals
are unknown. Missing/incomplete counters are null, never measured zero.

| Recorded group | Actual original grade | Interpretation |
| --- | --- | --- |
| course-live-v1 | 4/8 | Insights rubric over-required exact wording; onion review missed removed grounding; routing verdict was ambiguous; delegation runtime lacked rollout context. |
| course-live-v2 | 6/8 | Onion candidate checklist caught both input and output trust-boundary defects; Insights passed. Routing had a synonym false failure; strict delegation JSON evidence remained absent. |
| routing-phrase-control | 0/1 | Correct complete answer used equivalent trust/checkout wording; original false grade remains retained. |

The last routing outputs are now exact regression controls. Focused routing tests
pass **5/5**, including omission controls which still reject missing product,
trust or checkout constraints. This is a post-hoc validator correction, not a
claim that another real model run passed. Group percentages are not a controlled
model improvement comparison: grading, candidate checklist and runtime changed.

Delegation remains a disclosed compatibility gap. The initial ephemeral trial
could not find rollout context. Retaining context in delegation-only trials
allowed an actual parent-journal `collaboration.spawn_agent` response naming
`/root/architecture_reviewer`, but the CLI JSON stream emitted only wait events,
not the required named spawn/result. The strict automated check stays failed;
model prose is not substituted for telemetry. The separate L08 workflow uses
observable session delegation and independent gates; that does not relabel this
different CLI protocol result.

## Runtime boundary

Default strict isolation fails closed on this Windows backend because it cannot
enforce snapshot-only OS reads. The explicit `mcp-readonly` mode was separately
authorized for these trials. Fixed canaries prove physical writes denied and
manifest-scoped MCP reads; broad OS read/network denial is **not** claimed.
Loopback remained possible in the Windows probe despite networking disabled.

The model receives only fixed list/read MCP access to staged allowlisted bytes;
shell, image, apps, hooks, web and generic code tools remain disabled. Native V8
tool orchestration is enabled because this installed CLI requires its host.
The child environment is stripped of credentials. Limits bound files, total
snapshot, output, concurrency, trials and process lifetime; links/ancestor
replacement/traversal/digest changes are rejected. Raw fixtures/results remain
ignored in `evals/results/`; no credentials or private journals are committed.

Two startup attempts failed before the final compatible configuration: an obsolete
view-image config field, then disabled native tool host. Both failures are retained
with actual available usage. The successful write-canary model declined the
prohibited write rather than attempting one; absence alone is not claimed as a
model-observed tool refusal. Physical write denial comes from the separate probe.

No all-green live behavioral score, dollar saving, Claude inference or completed
live GitHub eval workflow is claimed. The remaining protocol gap is documented
with evidence rather than bypassed. Course video upload and submission remain held.
