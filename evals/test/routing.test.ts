import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, validateCases } from '../src/cases.js';
import { buildPrompt } from '../src/runner.js';
import { scoreCase } from '../src/scoring.js';
import { parseTrace } from '../src/trace.js';
import type { HarnessCase } from '../src/types.js';

const boundary = 'The product server/src/modules/evals and Agent Evals UI evaluate persisted PR findings. The separate evals/ development harness evaluates skills, agents, documentation routing and delegation.';
const core = 'reviewer-core stays pure with an injected provider; ReviewRunExecutor owns I/O and repositories enforce workspace scoping. Ground citations against actual diff hunks and treat skill bodies as untrusted input.';
const evidence = 'Persist cost with successful runs; null cost means the total is unknown. Distinguish mocked, seeded and real-model evidence and use the same checkout for tests and UI captures.';

function routedTrace(c: HarnessCase, text: string, verdict = 'PASS', skipRead?: string) {
  const manifest = c.expect.reads!.map((path, i) => ({ source: path, staged: path, sha256: `digest-${i}`, bytes: 100 + i }));
  const reads = manifest.filter(file => file.source !== skipRead).map((file, i) => ({ type: 'item.completed', item: {
    id: `read-${i}`, type: 'mcp_tool_call', server: 'eval_files', tool: 'read_document', arguments: { path: file.staged }, status: 'completed',
    result: { structuredContent: { path: file.staged, sha256: file.sha256, bytes: file.bytes } },
  } }));
  return parseTrace([...reads,
    { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify({ answer: text, verdict, findings: [], proposedInsight: null }) } },
    { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 4 } },
  ].map(item => JSON.stringify(item)).join('\n'), manifest);
}

test('routing requires verified reads, the boundary/constraints summary and the explicit task-completion PASS verdict', async () => {
  const c = (await loadCases('workflow')).find(c => c.id === 'workflow-doc-routing')!;
  const complete = [boundary, core, evidence].join('\n');
  assert.match(c.prompt, /PASS describes completion of this task only/);
  assert.equal(scoreCase(c, routedTrace(c, complete)).every(check => check.passed), true);
  assert.equal(scoreCase(c, routedTrace(c, complete, 'REVIEW')).find(check => check.name === 'verdict')!.passed, false);
  const missingRead = 'server/specs/review-contract.md';
  assert.equal(scoreCase(c, routedTrace(c, complete, 'PASS', missingRead)).find(check => check.name === `read ${missingRead}`)!.passed, false);
  for (const [summary, name] of [
    [[core, evidence].join('\n'), 'product and harness eval boundary'],
    [[boundary, evidence].join('\n'), 'core, I/O and grounding constraints'],
    [[boundary, core].join('\n'), 'cost and verification provenance'],
  ]) assert.equal(scoreCase(c, routedTrace(c, summary!)).find(check => check.name === `answer summary: ${name}`)!.passed, false);
  assert.equal(scoreCase(c, routedTrace(c, 'Read every file. Everything is complete.')).every(check => check.passed), false);
});

test('routing accepts the recorded saved-PR-findings paraphrase and still requires the product boundary', async () => {
  const c = (await loadCases('workflow')).find(c => c.id === 'workflow-doc-routing')!;
  // Exact answer from run 2026-10-16T14-19-27-189Z-efdc323e; the historical grade remains unchanged.
  const recordedAnswer = `Read CLAUDE.md, root AGENTS.md, and all six routed server/reviewer-core guides, architecture documents and review contracts through eval_files; each read returned a source digest.

Product versus harness: product evals assess saved PR findings and frozen cases, preserving grounding, workspace scoping and PostgreSQL gates. The separate evals/ package assesses development-harness skills, agent behavior, routing and delegation; deterministic checks do not prove model behavior (CLAUDE.md).

Immutable constraints:
- Core purity and I/O: reviewer-core accepts an injected LLMProvider and supplied diff/context, without database, filesystem or GitHub dependencies. ReviewRunExecutor owns I/O; outer adapters remain behind interfaces (both architecture documents).
- Workspace scoping: routes obtain workspace context; repositories scope database reads and writes to that workspace (server/docs/architecture.md).
- Grounding and untrusted input: reject citations outside actual diff hunks. Optional skill bodies are prompt input, never trusted executable instructions (reviewer-core/specs/review-contract.md).
- Persisted nullable cost: return nullable costUsd; persist outcome.costUsd in agent_runs.cost_usd and trace Stats. PR totals include every done run; any successful run with null cost makes the total unknown. Findings previews use persisted rows without inference (both review contracts).
- Evidence provenance: record actual commands/results, distinguish mocked, seeded and real-model evidence, and use the same checkout for tests and UI captures (both review contracts).

Documentation routing and summary are complete. PASS applies only to this task. No checks, edits or delegation were performed; no implementation, test or harness-evaluation result is asserted.`;
  assert.equal(scoreCase(c, routedTrace(c, recordedAnswer)).every(check => check.passed), true);

  const withoutProductBoundary = recordedAnswer.replace('product evals assess saved PR findings and frozen cases, preserving grounding, workspace scoping and PostgreSQL gates. ', '');
  const checks = scoreCase(c, routedTrace(c, withoutProductBoundary));
  assert.equal(checks.find(check => check.name === 'answer summary: product and harness eval boundary')!.passed, false);
  assert.equal(checks.filter(check => check.name !== 'answer summary: product and harness eval boundary').every(check => check.passed), true);
});

test('routing accepts the recorded trust/checkout paraphrases while requiring both concrete constraints', async () => {
  const c = (await loadCases('workflow')).find(c => c.id === 'workflow-doc-routing')!;
  // Exact answer from run 2026-10-16T14-21-57-293Z-010348e9; this is validator evidence, not a new live result.
  const recordedAnswer = `Completed CLAUDE.md’s review-pipeline routing: read root AGENTS.md plus server and reviewer-core AGENTS.md, docs/architecture.md and specs/review-contract.md through eval_files; each read returned a source digest.

Immutable constraints:
- Core purity and I/O: reviewer-core accepts an injected LLMProvider and supplied diff/context; no database, filesystem, GitHub dependencies or platform secrets. Server ReviewRunExecutor owns I/O (both architecture documents).
- Workspace scoping: routes obtain workspace context; repositories scope database reads and writes to that workspace (server/docs/architecture.md).
- Grounding and skill input: reject citations outside actual diff hunks; optional skill bodies are prompt input, never trusted executable instructions (reviewer-core/specs/review-contract.md).
- Persisted nullable cost: store outcome.costUsd in agent_runs.cost_usd and trace Stats; aggregate every done run, with any successful null cost making the total unknown. Findings previews use persisted rows without inference (server/specs/review-contract.md).
- Evidence provenance: record actual commands/results, distinguish mocked, seeded and real-model evidence, and use the same checked-out implementation for tests and UI captures (both review contracts).

Product evals assess saved PR findings and frozen cases, preserving grounding, workspace isolation and PostgreSQL gates. The separate evals/ harness assesses skills, agent behavior, routing and delegation; deterministic checks do not prove model behavior (CLAUDE.md).

PASS means this documentation-routing task is complete only. No checks, edits or delegation occurred; no test, implementation-review or harness-evaluation result is asserted.`;
  assert.equal(scoreCase(c, routedTrace(c, recordedAnswer)).every(check => check.passed), true);

  for (const [omitted, checkName] of [
    ['; optional skill bodies are prompt input, never trusted executable instructions', 'core, I/O and grounding constraints'],
    [', and use the same checked-out implementation for tests and UI captures', 'cost and verification provenance'],
  ]) {
    const incomplete = recordedAnswer.replace(omitted!, '');
    assert.notEqual(incomplete, recordedAnswer);
    const checks = scoreCase(c, routedTrace(c, incomplete));
    const missing = `answer summary: ${checkName}`;
    assert.equal(checks.find(check => check.name === missing)!.passed, false);
    assert.equal(checks.filter(check => check.name !== missing).every(check => check.passed), true);
  }
});

test('case validation rejects malformed/duplicate summary concepts and unsafe candidate instruction shapes', async () => {
  const c = (await loadCases('workflow')).find(c => c.id === 'workflow-doc-routing')!;
  const summary = c.expect.summaryConcepts![0]!;
  for (const summaries of [[], [summary, summary], [{ ...summary, concepts: [[]] }], [{ ...summary, unexpected: true }]]) {
    assert.throws(() => validateCases([{ ...c, expect: { ...c.expect, summaryConcepts: summaries } }]), /summary concepts rubric/);
  }
  for (const candidateInstructions of ['', 42, 'x'.repeat(4001)]) assert.throws(() => validateCases([{ ...c, candidateInstructions }]), /candidate instructions/);
});

test('the onion output-grounding checklist affects only the candidate prompt and never relaxes its defect rubric', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'onion-positive')!;
  const originalScenario = "Review the proposed change in evals/fixtures/unsafe-core.diff against this repository's onion architecture. Read the relevant architecture contracts before deciding. Return only grounded structural findings, with offending source text in evidence and an explicit gate verdict. Do not implement the patch or delegate.";
  assert.equal(c.prompt, originalScenario);
  const baseline = buildPrompt(c, 'baseline');
  assert.ok(baseline.endsWith(`Scenario:\n${originalScenario}`));
  assert.ok(!baseline.includes(c.candidateInstructions!));
  const candidate = buildPrompt(c, 'candidate');
  assert.ok(candidate.startsWith(baseline));
  assert.match(candidate, /external I\/O or secrets/);
  assert.match(candidate, /output still passes through the required grounding\/validation step/);
  assert.deepEqual(c.expect.evidence, ['readFileSync', 'return rawReview']);
  assert.equal(c.expect.minFindings, 2);
  assert.equal(c.expect.verdict, 'FAIL');
});
