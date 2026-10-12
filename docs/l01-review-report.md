# L01: actual reviews and workflow observations

Run date: 2026-10-12. Feature PR: https://github.com/imaxxer121/dev-digest/pull/1.
The published severity demo uses the deterministic seed fixture. The model
results below are separate, actual DevDigest runs, with nonempty diffs and saved
prompts, raw output, findings and usage in [evidence/l01](evidence/l01).

## Tool and scope

Provider: local Codex CLI, model `gpt-6.1-sol`, authenticated with an existing
ChatGPT subscription. No API key was supplied. The local provider adapter is
included in the follow-up L02 implementation. Dollar usage is unavailable and
stored as `null`, never as an invented price or free API call.

The three small fixtures use the official lesson demo commits against their
shared course base. The security fixture preserves the original upstream
authors and reproduces its two commits on a compatible base because the newer
upstream branch has unrelated history.

| Demo PR | Actual run | Findings | Citation grounding | Input/output tokens | Duration |
| --- | --- | ---: | --- | --- | ---: |
| [Agent summary #2](https://github.com/imaxxer121/dev-digest/pull/2) | `daf23cbe-9148-4106-b3aa-b9a54bcd4518` | 0 | 0/0 | 17,472 / 259 | 12.184 s |
| [Repo activity #3](https://github.com/imaxxer121/dev-digest/pull/3) | `dd4db7e7-5158-4e17-953f-67b351be50da` | 1 | 1/1 | 17,656 / 1,292 | 45.367 s |
| [Share webhook #4](https://github.com/imaxxer121/dev-digest/pull/4) | `4acd5c15-288a-4ddc-8119-58b6f567eaa9` | 2 | 2/2 | 17,825 / 1,797 | 66.191 s |
| [Security fixture #5](https://github.com/imaxxer121/dev-digest/pull/5) | `064b7dee-e376-4278-84b6-8010197749c6` | 12 | 12/12 | 18,740 / 5,367 | 148.955 s |

Citation grounding verifies references against the supplied diff. It does not
establish exploitability, completeness or precision. Zero findings is not proof
that the first fixture has no defects. Seed findings are excluded from this table.

## Same-diff prompt comparison

The webhook PR was reviewed again with the same model and unchanged head,
using a more explicit checklist for endpoint inputs, workspace ownership,
external destinations, redirect behavior and delivery errors. The exact two
system prompts are preserved in the run traces.

The focused run `28a481bc-2ebd-4918-b35e-3ef153eb0bd2` found the same two root
causes: arbitrary webhook destinations permit SSRF; non-2xx deliveries still
return success. It used 17,869 input and 2,068 output tokens in 73.011 seconds,
with 2/2 citations grounded. Its explanation states access and reachability
preconditions, but this single comparison demonstrates no increase in detected
defects. Broad instructions already found both issues. The extra checklist
increased output and duration in this run.

Claude Code was unavailable. No Claude run or same-prompt comparison with Claude
is claimed. The alternative tool and this remaining course requirement are
explicitly disclosed for mentor review.

## Feature review and corrections

An actual review of feature PR #1, run
`08533900-2526-4a0c-92f8-6ddb73b34bfa`, found three actionable integration issues:
historical traces without cost failed schema parsing; portal link Enter events
were intercepted by the anchor; the run-history preview had no findings map.
All three were corrected in the published feature branch, with focused tests.

An earlier run had received an empty diff and cannot be used as quality evidence.
The loader now rejects empty diffs. Public API timeouts also caused failed demo
attempts; failures remain in the local history and are excluded from the completed
run table. Fetching the exact public Git revisions resolved the shallow-clone
problem without a GitHub token.

## Engineering insights

The insights skill was invoked manually after validation. Useful discoveries
were concrete: Windows file URLs could suppress script entry points; severity
counts must follow confidence filtering; missing historical cost needs a nullable
default. The notes include dates and source lines. This is a reusable local memory
workflow; it is not evidence that future model reviews improve automatically.

The five-phase feature workflow and fixture UI video are recorded in
[review-workflow.md](review-workflow.md). The video is a step-by-step capture of
verified UI states, rather than a claim of continuous screen recording.
