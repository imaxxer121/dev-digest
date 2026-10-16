import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCases } from '../src/cases.js';
import { scoreCase, parseAnswer } from '../src/scoring.js';
import { parseTrace } from '../src/trace.js';
import { stageCase, removeSnapshot, readSource } from '../src/stage.js';
test('architecture cases distinguish unsafe core I/O/grounding from a benign local rename', async () => {
  const cases = await loadCases('agents'); assert.equal(cases.length, 2);
  assert.deepEqual(cases.find(c => c.id === 'architecture-defect')?.expect.evidence, ['readFileSync', 'return rawReview']);
  const benign = cases.find(c => c.id === 'architecture-benign')!;
  const trace = parseTrace(JSON.stringify({ type: 'item.completed', item: { id: 'a', type: 'agent_message', text: JSON.stringify({ answer: 'A rename only', verdict: 'PASS', findings: [{ file: 'x', line: 1, severity: 'high', evidence: 'const', rule: 'style', reason: 'invented' }] }) } }));
  assert.equal(scoreCase(benign, trace).find(check => check.name === 'maximum findings')?.passed, false);
  assert.throws(() => parseAnswer('{"verdict":"PASS"}'), /schema/);
});
test('snapshots copy only allowlisted source bytes outside checkout and remove only the target artifact for baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eval-source-')), evidence = await mkdtemp(join(tmpdir(), 'eval-evidence-'));
  let snapshot: string | undefined;
  try {
    await writeFile(join(root, 'AGENTS.md'), 'Real project instructions'); await writeFile(join(root, 'CLAUDE.md'), 'Routing');
    await mkdir(join(root, '.claude/skills/example'), { recursive: true }); await writeFile(join(root, '.claude/skills/example/SKILL.md'), 'Actual artifact bytes');
    await writeFile(join(root, '.env'), 'SECRET_NOT_ALLOWED');
    const c = { ...(await loadCases('skills'))[0]!, nativeSkill: 'example', artifact: '.claude/skills/example/SKILL.md', files: ['CLAUDE.md'] };
    const staged = await stageCase(c, evidence, 'candidate', root); snapshot = staged.snapshot;
    assert.ok(!snapshot.startsWith(root)); assert.ok(!snapshot.startsWith(evidence));
    assert.equal(await readFile(join(snapshot, '.agents/skills/example/SKILL.md'), 'utf8'), 'Actual artifact bytes');
    await assert.rejects(readFile(join(snapshot, '.env')));
    assert.equal(staged.manifest.find(file => file.staged === '.agents/skills/example/SKILL.md')?.source, c.artifact);
    await removeSnapshot(snapshot); snapshot = undefined;
    const baseline = await stageCase(c, evidence, 'baseline', root); snapshot = baseline.snapshot;
    await assert.rejects(readFile(join(snapshot, c.artifact))); assert.ok(baseline.manifest.some(file => file.source === 'CLAUDE.md'));
    await assert.rejects(readSource(root, '../outside'), /Unsafe/); await assert.rejects(removeSnapshot(root), /unexpected/);
  } finally { if (snapshot) await removeSnapshot(snapshot); await rm(root, { recursive: true, force: true }); await rm(evidence, { recursive: true, force: true }); }
});
