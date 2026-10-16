import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, validateCases } from '../src/cases.js';
import { parseTrace } from '../src/trace.js';
import { scoreCase, parseAnswer, ANSWER_SCHEMA } from '../src/scoring.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT } from '../src/paths.js';
import type { Answer, HarnessCase } from '../src/types.js';
const stream = (...events: unknown[]) => events.map(event => JSON.stringify(event)).join('\n');
const answer = { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify({ answer: 'Conceptual explanation.', verdict: 'PASS', findings: [] }) } };
const done = { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 4 } };

test('realistic Skill cases contain explicit positive/near-miss negative activation controls', async () => {
  const cases = await loadCases('skills'); assert.equal(cases.length, 3);
  assert.ok(cases.find(c => c.id === 'insights-positive')?.expect.reads?.includes('.claude/skills/engineering-insights/SKILL.md'));
  assert.equal(cases.find(c => c.id === 'insights-negative')?.expect.noTools, true);
  assert.throws(() => validateCases([{ ...cases[0], files: ['../outside'] }]), /source list/);
  assert.throws(() => validateCases([cases[0], cases[0]]), /duplicate/);
});
test('a negative activation pass requires zero actual tools, not merely reassuring prose', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-negative')!;
  assert.equal(scoreCase(c, parseTrace(stream(answer, done))).every(check => check.passed), true);
  const actualRead = { type: 'item.completed', item: { id: 'read', type: 'command_execution', command: 'cat .claude/skills/engineering-insights/SKILL.md', exit_code: 0, status: 'completed', aggregated_output: 'body' } };
  assert.equal(scoreCase(c, parseTrace(stream(actualRead, answer, done))).find(check => check.name === 'no tool calls')?.passed, false);
  assert.equal(scoreCase(c, parseTrace(stream(answer))).find(check => check.name === 'no tool calls')?.passed, false);
});
test('a positive activation cannot pass from a prose claim to have used a Skill', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-positive')!;
  const checks = scoreCase(c, parseTrace(stream(answer, done)));
  assert.equal(checks.find(check => check.name.includes('.claude/skills/engineering-insights'))?.passed, false);
});

function verifiedReads(c: HarnessCase, output: unknown) {
  const manifest = c.expect.reads!.map((path, i) => ({ source: path, staged: path, sha256: `digest-${i}`, bytes: 100 + i }));
  const reads = manifest.map((file, i) => ({ type: 'item.completed', item: { id: `read-${i}`, type: 'mcp_tool_call', server: 'eval_files', tool: 'read_document', arguments: { path: file.staged }, status: 'completed',
    result: { structuredContent: { path: file.staged, sha256: file.sha256, bytes: file.bytes } } } }));
  return parseTrace(stream(...reads, { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify(output) } }, done), manifest);
}
const proposed: Answer = {
  answer: 'Proposed repository note; verification is attributed to the supplied user report.', verdict: 'PASS', findings: [],
  proposedInsight: { date: '2026-10-16', discovery: 'Windows CLI entry points must compare import.meta.url with pathToFileURL(resolve(process.argv[1])).href.',
    consequence: 'Without this conversion, Windows CLI comparisons skip migration execution.',
    source: { file: 'server/src/db/migrate.ts', line: 37, evidence: 'if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {' },
    verification: { provenance: 'user_report', evidence: 'I verified with deterministic fixtures', result: 'Deterministic fixtures verified the entry-point behavior; no exact command or test count was supplied.', command: null } },
};
test('verified reads plus an empty PASS or a generic unsupported answer cannot satisfy the requested Insights artifact', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-positive')!;
  for (const output of [{ answer: '', verdict: 'PASS', findings: [] }, { answer: 'Everything is good.', verdict: 'PASS', findings: [] }, { ...proposed, proposedInsight: null }]) {
    const trace = verifiedReads(c, output);
    assert.equal(trace.reads.length, c.expect.reads!.length);
    assert.equal(scoreCase(c, trace).every(check => check.passed), false);
  }
  const generic = structuredClone(proposed);
  generic.proposedInsight!.discovery = 'Useful engineering facts were discovered.';
  generic.proposedInsight!.consequence = 'This improves quality.';
  assert.equal(scoreCase(c, verifiedReads(c, generic)).find(check => check.name === 'Insight discovery')!.passed, false);
  assert.equal(scoreCase(c, verifiedReads(c, generic)).find(check => check.name === 'Insight consequence')!.passed, false);
});
test('a valid proposed Insight requires the actual source citation and supplied verification without inventing a command or count', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-positive')!;
  const rubric = c.expect.answerRubric!;
  const lines = (await readFile(join(REPO_ROOT, rubric.source.file), 'utf8')).split(/\r?\n/);
  assert.ok(lines[rubric.source.line - 1]?.includes(rubric.source.evidence));
  assert.ok(c.prompt.includes(rubric.verification.evidence));
  assert.deepEqual(parseAnswer(JSON.stringify(proposed)), proposed);
  assert.equal(scoreCase(c, verifiedReads(c, proposed)).every(check => check.passed), true);
  const alternate = structuredClone(proposed);
  alternate.proposedInsight!.verification.result = 'User verified Windows argv[1] entry checks with deterministic fixtures; no new execution.';
  assert.equal(scoreCase(c, verifiedReads(c, alternate)).every(check => check.passed), true);
  for (const change of [
    (answer: Answer) => { answer.proposedInsight!.source.line = 999; },
    (answer: Answer) => { answer.proposedInsight!.verification.provenance = 'model_observation'; },
    (answer: Answer) => { answer.proposedInsight!.verification.command = 'npm test'; },
    (answer: Answer) => { answer.proposedInsight!.verification.result = 'All tests passed.'; },
    (answer: Answer) => { answer.proposedInsight!.verification.result = 'Deterministic fixtures passed 100 tests.'; },
    (answer: Answer) => { answer.proposedInsight!.verification.evidence += ' The suite passed 100 tests.'; },
    (answer: Answer) => { answer.proposedInsight!.verification.evidence += ' Ten fixtures passed.'; },
    (answer: Answer) => { answer.proposedInsight!.verification.result = 'I reran the deterministic fixtures and verified them.'; },
    (answer: Answer) => { answer.proposedInsight!.verification.result = 'Unverified; PASS is only a guess.'; },
    (answer: Answer) => { answer.proposedInsight!.verification.evidence = 'The user supplied a claim.'; answer.proposedInsight!.verification.result = 'This looks useful.'; },
  ]) {
    const unsupported = structuredClone(proposed); change(unsupported);
    assert.equal(scoreCase(c, verifiedReads(c, unsupported)).every(check => check.passed), false);
  }
});

test('the actual live user-report paraphrase passes without an exact first-person quote or repeated result wording', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-positive')!;
  // Exact verification fields from the preserved course-live-v1 answer. This
  // regression does not load, regrade or rewrite ignored historical records.
  const actual = structuredClone(proposed);
  actual.proposedInsight!.verification = {
    provenance: 'user_report',
    evidence: 'The user reports verifying with deterministic fixtures that Windows CLI detection requires pathToFileURL(resolve(argv[1])).href; otherwise migration execution is skipped.',
    result: 'User-reported fixture verification supports the discovery. Source inspection confirms the guard at line 37. Fixtures were not rerun; no command or test count was supplied.',
    command: null,
  };
  assert.equal(scoreCase(c, verifiedReads(c, actual)).every(check => check.passed), true);
  const noFixtureEvidence = structuredClone(actual);
  noFixtureEvidence.proposedInsight!.verification.evidence = 'The user reports verifying Windows entry-point behavior.';
  noFixtureEvidence.proposedInsight!.verification.result = 'User-reported verification supports the discovery; nothing was rerun.';
  assert.equal(scoreCase(c, verifiedReads(c, noFixtureEvidence)).find(check => check.name === 'Insight verified result')!.passed, false);
});
test('structured answer/rubric schemas reject missing, malformed, unstaged or unsupported evidence fields', async () => {
  assert.ok(ANSWER_SCHEMA.required.includes('proposedInsight'));
  assert.ok(ANSWER_SCHEMA.properties.proposedInsight.anyOf.some(schema => schema.type === 'null'));
  const c = (await loadCases('skills')).find(c => c.id === 'insights-positive')!;
  for (const patch of [
    { ...proposed, proposedInsight: { ...proposed.proposedInsight!, date: '2026-02-30' } },
    { ...proposed, proposedInsight: { ...proposed.proposedInsight!, verification: { result: 'passed' } } },
    { ...proposed, proposedInsight: { ...proposed.proposedInsight!, extra: 'not in schema' } },
  ]) assert.throws(() => parseAnswer(JSON.stringify(patch)), /Insight/);
  // Historical unrelated records can retain the old shape; the live output schema
  // requires nullable proposedInsight, and the positive case additionally gates it.
  assert.equal(parseAnswer(JSON.stringify({ answer: 'Concept only', verdict: 'PASS', findings: [] })).proposedInsight, undefined);
  const invalid = [
    { ...c.expect.answerRubric!, discoveryConcepts: [[]] },
    { ...c.expect.answerRubric!, source: { ...c.expect.answerRubric!.source, file: 'not-staged.md' } },
    { ...c.expect.answerRubric!, verification: { ...c.expect.answerRubric!.verification, evidence: 'A test result not in the case input' } },
  ];
  for (const rubric of invalid) assert.throws(() => validateCases([{ ...c, expect: { ...c.expect, answerRubric: rubric } }]), /rubric|case evidence/);
});
