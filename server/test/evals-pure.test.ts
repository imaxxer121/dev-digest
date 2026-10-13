import { describe, expect, it } from 'vitest';
import { historicalSource, parseStrictDiff, freezeFile } from '../src/modules/evals/source.js';
import { canonical, digest, inputDigest, textDigest } from '../src/modules/evals/digest.js';
import { strictGround } from '../src/modules/evals/grounding.js';
import { scoreGroup, aggregateGroups } from '../src/modules/evals/scorer.js';
import { buildSnapshot, groupPrompt, initialBatch, pendingGroup, summarize } from '../src/modules/evals/snapshot.js';
import { DIFF, FILE, agentSnapshot, skillSnapshot, frozenCase, candidate } from './helpers/evals.js';

describe('eval exact source recovery', () => {
  const wrap = (raw = DIFF) => ({ prompt_assembly: { user: `Neutral task\n\n## Diff to review\n<untrusted source="diff">\n${raw}\n</untrusted>`, pr_description: 'Historical description' } });
  it('recovers exact historical bytes with proven description but no invented current title/head', () => {
    expect(historicalSource(wrap())).toEqual({ raw: DIFF, retrieval: 'trace-diff-block', title: null, head: null, description: 'Historical description' });
  });
  it('prefers exact future metadata and does not reverse escaped wrapper contents', () => {
    const raw = DIFF.replace('+new', '+</untrusted>');
    expect(historicalSource({ ...wrap('ambiguous'), source_diff: raw, source_head_sha: 'saved-head', source_pr: { title: 'Saved title', description: 'Saved description' } }))
      .toEqual({ raw, retrieval: 'trace-source-diff', head: 'saved-head', title: 'Saved title', description: 'Saved description' });
  });
  it.each([
    { prompt_assembly: { user: 'no saved diff' } },
    { prompt_assembly: { user: `${wrap().prompt_assembly.user}\nextra` } },
    { prompt_assembly: { user: `prefix${wrap().prompt_assembly.user.slice('Neutral task\n\n'.length)}` } },
    wrap(`${DIFF}<\\/untrusted>`), wrap(`${DIFF}</untrusted>`), wrap(`${DIFF}## Diff to review\n<untrusted source="diff">\n`), null,
  ])('rejects unsupported/ambiguous historical framing %#', trace => {
    expect(() => historicalSource(trace)).toThrowError(expect.objectContaining({ code: 'eval_source_unsupported', statusCode: 409 }));
  });
  it('extracts the exact complete file section by parsed identity, retaining Unicode and CRLF', () => {
    const first = DIFF.replaceAll('src/check.ts', 'src/check.tsx');
    const second = DIFF.replace('+new', '+café 茶 🧭').replaceAll('\n', '\r\n');
    expect(freezeFile(first + second, FILE).raw).toBe(second);
    expect(freezeFile(first + second, FILE).file.hunks[0]!.newLineNumbers).toEqual([10, 11, 12, 13]);
    expect(() => freezeFile(first, FILE)).toThrow('absent');
  });
  it('does not turn deleted-only rows or a trailing split artifact into new-side coverage', () => {
    const deleted = 'diff --git a/gone.ts b/gone.ts\n--- a/gone.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-old\n\\ No newline at end of file\n';
    expect(parseStrictDiff(deleted)[0]!.file).toMatchObject({ path: 'gone.ts', additions: 0, deletions: 1, hunks: [{ newStart: 0, newLines: 0, newLineNumbers: [] }] });
    expect(strictGround([candidate(1, 1, { file: 'gone.ts', kind: 'secret_leak' })], [parseStrictDiff(deleted)[0]!.file]).grounded).toEqual([]);
  });
  it.each([
    DIFF.replace('@@ -10,3 +10,4 @@', '@@ -10,3 +10,5 @@'),
    DIFF.replace('@@ -10,3 +10,4 @@', '@@ -10,3 +0,4 @@'),
    DIFF.replaceAll('src/check.ts', '../escape.ts'),
    DIFF + DIFF,
    DIFF.replace(' keep', 'metadata'),
    'diff --git a/a b/a\nBinary files a/a and b/a differ\n',
  ])('rejects inconsistent, unsupported or ambiguous file metadata %#', raw => expect(() => parseStrictDiff(raw)).toThrow());
  it('bounds frozen file bytes rather than JavaScript character count', () => {
    const huge = DIFF.replace('+new', `+${'茶'.repeat(22_000)}`);
    expect(() => freezeFile(huge, FILE)).toThrow('65,536');
  });
});

describe('eval strict positional scorer (pure zero-I/O)', () => {
  const one = frozenCase();
  const at = (line: number, kind: 'must_find' | 'must_not_flag' = 'must_find') => frozenCase({ expected_output: { kind, file: FILE, start_line: line, end_line: line } });
  it('finds maximum cardinality where greedy first-match loses a positive', () => {
    const a = at(10), b = at(11); a.id = '00000000-0000-4000-8000-000000000001'; b.id = '00000000-0000-4000-8000-000000000002';
    const result = scoreGroup([b, a], [candidate(10, 11), candidate(10)], one.input_files);
    expect(result.counts.true_positives).toBe(2);
    expect(result.case_results).toEqual([{ case_id: a.id, pass: true, matched_candidate_index: 1 }, { case_id: b.id, pass: true, matched_candidate_index: 0 }]);
  });
  it('preserves duplicates, wrong paths, ungrounded noise and unmatched candidates in raw precision', () => {
    const result = scoreGroup([one], [candidate(), candidate(), candidate(100), candidate(11, 11, { file: 'src/other.ts' }), candidate(13)], one.input_files);
    expect(result.counts).toEqual({ expected_positives: 1, true_positives: 1, false_negatives: 0, raw_candidates: 5, grounded_candidates: 3, false_positives: 4 });
    expect(result.metrics).toEqual({ recall: 1, precision: 0.2, citation_accuracy: 0.6 });
    expect(result.rejected.map(item => item.candidate_index)).toEqual([2, 3]);
  });
  it('raw negative overlaps fail negative cases and cannot also satisfy overlapping positives', () => {
    const negative = at(11, 'must_not_flag');
    const result = scoreGroup([one, negative], [candidate(0, 11)], one.input_files);
    expect(result.counts).toMatchObject({ true_positives: 0, raw_candidates: 1, grounded_candidates: 0, false_positives: 1 });
    expect(result.case_results.every(item => item.pass === false)).toBe(true);
  });
  it.each([0, -1, 100, 10.5])('rejects invalid/outside citations even for scanner kind: %s', start => {
    expect(strictGround([candidate(start, start, { kind: 'secret_leak' })], one.input_files).grounded).toEqual([]);
  });
  it('accepts interval intersection only on exact real new-side path/range', () => {
    expect(strictGround([candidate(9, 10), candidate(12, 11), candidate(10, 10, { file: './src/check.ts' })], one.input_files).indices).toEqual([0]);
  });
  it('distinguishes null denominator from a real zero for positive/negative suites', () => {
    expect(scoreGroup([one], [], one.input_files).metrics).toEqual({ recall: 0, precision: null, citation_accuracy: null });
    const negative = at(11, 'must_not_flag');
    expect(scoreGroup([negative], [], one.input_files)).toMatchObject({ metrics: { recall: null, precision: null, citation_accuracy: null }, case_results: [{ pass: true }] });
    expect(scoreGroup([negative], [candidate()], one.input_files).metrics).toEqual({ recall: null, precision: 0, citation_accuracy: 1 });
  });
  it('aggregates integer counts once per group with weighting and null partial/unknown cost', () => {
    const snap = buildSnapshot(agentSnapshot(), [], [one]);
    const first = { ...pendingGroup(snap.groups[0]!), status: 'completed' as const, ...scoreGroup([one], [candidate()], one.input_files), cost_usd: 0.2 };
    const second = { ...first, ...scoreGroup([one], Array.from({ length: 9 }, () => candidate(100)), one.input_files), cost_usd: null };
    expect(aggregateGroups([first, second], true)).toMatchObject({ counts: { expected_positives: 2, true_positives: 1, raw_candidates: 10 }, metrics: { recall: 0.5, precision: 0.1, citation_accuracy: 0.1 }, cost_usd: null });
    expect(aggregateGroups([first, second], false).metrics).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });
});

describe('eval coherent snapshot and effective prompt', () => {
  it('canonicalizes object keys recursively while preserving exact strings and array order', () => {
    expect(canonical({ z: [1, { b: 2, a: 1 }], a: '茶\r\n' })).toBe('{"a":"茶\\r\\n","z":[1,{"a":1,"b":2}]}');
    expect(digest({ a: 1, b: { c: 2, d: 3 } })).toBe(digest({ b: { d: 3, c: 2 }, a: 1 }));
    expect(digest([1, 2])).not.toBe(digest([2, 1])); expect(textDigest('x\n')).not.toBe(textDigest('x\r\n'));
  });
  it('groups omitted null/empty/whitespace descriptions into one actual model input', () => {
    const cases = [null, '', ' \n\t '].map(description => {
      const item = frozenCase(); item.input_meta.pr_description = description; item.input_meta.input_digest = inputDigest(DIFF, null, description); return item;
    });
    const snap = buildSnapshot(agentSnapshot(), [], cases);
    expect(snap.groups).toHaveLength(1); expect(snap.groups[0]!.case_ids).toHaveLength(3); expect(snap.groups[0]!.pr_description).toBeNull();
  });
  it('keeps labels, answers, notes, source IDs and disabled skills out of messages', () => {
    const item = frozenCase(); const active = skillSnapshot(), disabled = skillSnapshot({ body: 'DISABLED_SENTINEL', enabled: false });
    const snap = buildSnapshot(agentSnapshot(), [active, disabled], [item]);
    const request = JSON.stringify(groupPrompt(snap.agent, snap.skills, snap.groups[0]!).messages);
    for (const hidden of ['LABEL_SENTINEL', 'NOTES_SENTINEL', 'must_find', item.input_meta.source.finding_id, 'DISABLED_SENTINEL']) expect(request).not.toContain(hidden);
    for (const visible of ['SYSTEM_SNAPSHOT', 'SKILL_SNAPSHOT', 'diff --git', '+new']) expect(request).toContain(visible);
    expect(snap.profile).toMatchObject({ strategy: 'single-pass', max_retries: 0, effective_schema: 'Review' });
    expect(snap.profile.schema_json).toHaveProperty('properties');
  });
  it('dataset/comparison remain stable across prompt/model/enabled skill edits while configuration changes', () => {
    const agent = agentSnapshot(); const item = frozenCase(); const skill = skillSnapshot();
    const first = buildSnapshot(agent, [skill], [item]);
    const changed = buildSnapshot({ ...agent, system_prompt: 'Changed', model: 'other', version: 2 }, [{ ...skill, body: 'Other', digest: textDigest('Other') }], [item]);
    expect(changed.dataset_digest).toBe(first.dataset_digest); expect(changed.comparison_key).toBe(first.comparison_key); expect(changed.config_digest).not.toBe(first.config_digest);
    const changedCase = structuredClone(item); changedCase.expected_output.start_line = 12; changedCase.expected_output.end_line = 12;
    expect(buildSnapshot(agent, [skill], [changedCase]).comparison_key).not.toBe(first.comparison_key);
  });
  it('rejects zero, unsupported, contradictory and oversized inputs before execution', () => {
    const agent = agentSnapshot(), item = frozenCase();
    expect(() => buildSnapshot(agent, [], [])).toThrow('1–128');
    expect(() => buildSnapshot(agent, [], [item, frozenCase({ expected_output: { ...item.expected_output, kind: 'must_not_flag' } })])).toThrow('overlap');
    const bad = structuredClone(item); bad.input_files[0]!.hunks[0]!.newLineNumbers.push(99);
    expect(() => buildSnapshot(agent, [], [bad])).toThrow('metadata');
    const description = structuredClone(item); description.input_meta.pr_description = 'x'.repeat(4001); description.input_meta.input_digest = inputDigest(DIFF, null, description.input_meta.pr_description);
    expect(() => buildSnapshot(agent, [], [description])).toThrow('description');
    expect(() => buildSnapshot({ ...agent, system_prompt: 'x'.repeat(132_000) }, [], [item])).toThrow('128 KiB');
  });
  it('fails an interrupted orphan even when every group had completed before terminal persistence', () => {
    const item = frozenCase(); const snap = buildSnapshot(agentSnapshot(), [], [item]); const detail = initialBatch('00000000-0000-4000-8000-000000000099', new Date().toISOString(), snap);
    detail.groups[0] = { ...detail.groups[0]!, status: 'completed', candidates: [candidate()], ...scoreGroup([item], [candidate()], item.input_files) };
    const interrupted = summarize(detail, true, 'Interrupted by restart');
    expect(interrupted).toMatchObject({ status: 'failed', groups_succeeded: 1, cases_passed: 1, metrics: { recall: null, precision: null, citation_accuracy: null } });
    expect(interrupted.groups[0]!.candidates).toEqual([candidate()]);
  });
});
