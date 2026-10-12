import { describe, it, expect } from 'vitest';
import { BriefOutput } from '@devdigest/shared';
import { toJsonSchema } from '../src/platform/structured.js';
import { candidateLines, prepareBriefInput, utf8Prefix, localIssueNumber, type BriefFacts } from '../src/modules/brief/input.js';
import { SCHEMA_NAME } from '../src/modules/brief/constants.js';

const empty = (): BriefFacts => ({ pr: { number: 9, title: 'Shared helper', body: null, headSha: 'a'.repeat(40) },
  intent: null, blast: null, files: [], issue: null, issueStatus: 'not_linked', specs: [] });
describe('Brief prepared input', () => {
  it('resolves standalone local issue numbers without confusing qualified references or URL fragments', () => {
    expect(localIssueNumber('Fixes other/repo#45. Closes #71.')).toBe(71);
    expect(localIssueNumber('https://github.com/other/repo/issues/45#99 owner/repo#42')).toBeNull();
    expect(localIssueNumber('#8 first, #9 second')).toBe(8);
  });
  it('measures the exact messages/schema envelope plus labeled reserve and excludes patch bodies', () => {
    const facts = empty();
    facts.files = [{ path: 'server/helper.ts', additions: 3, deletions: 1,
      patch: '@@ -1,2 +7,3 @@\n+DO_NOT_SEND_THIS_PATCH_BODY\n@@ -4,1 +14,0 @@\n-old\n@@ -5 +21 @@\n+body' }];
    const result = prepareBriefInput(facts);
    const payload = JSON.stringify({ messages: result.messages, schemaName: SCHEMA_NAME, jsonSchema: toJsonSchema(BriefOutput, SCHEMA_NAME).schema });
    expect(result.metrics.measured_payload_bytes).toBe(Buffer.byteLength(payload, 'utf8'));
    expect(result.metrics.budgeted_input_bytes).toBe(Buffer.byteLength(payload, 'utf8') + 1024);
    expect(result.messages[1].content).not.toContain('DO_NOT_SEND_THIS_PATCH_BODY');
    expect(result.messages[1].content).not.toContain('@@');
    expect(result.facts.files[0]?.candidate_lines).toEqual([7, 21]);
    expect(Object.keys(result.facts.files[0]!)).toEqual(['path', 'additions', 'deletions', 'role', 'candidate_lines']);
  });
  it('bounds Unicode/escaping/many entries deterministically and retains an attached spec prefix/digest', () => {
    const facts = empty(), large = '🙂Українська"\\\n'.repeat(9000);
    facts.pr.body = large; facts.pr.title = large;
    facts.intent = { intent: large, in_scope: Array(100).fill(large), out_of_scope: [large] };
    facts.issue = { number: 2, title: large, body: large, state: 'open' }; facts.issueStatus = 'available';
    facts.files = Array.from({ length: 400 }, (_, i) => ({ path: `src/${i.toString().padStart(4,'0')}.ts`, additions: i, deletions: 1 }));
    facts.specs = Array.from({ length: 30 }, (_, i) => ({ path: `specs/${i.toString().padStart(2,'0')}.md`, content: large }));
    facts.blast = { summary: 'cached', changed_symbols: [], degraded: true, reason: 'index_partial', indexed_sha: 'older-sha',
      downstream: [{ symbol: 'f', callers: Array.from({ length: 100 }, (_, i) => ({ name: 'caller', file: `routes/${i}.ts`, line: i + 1 })), endpoints_affected: [], crons_affected: [] }] };
    const result = prepareBriefInput(facts);
    expect(result).toEqual(prepareBriefInput(facts));
    expect(result.metrics.budgeted_input_bytes).toBeLessThanOrEqual(32000);
    expect(result.facts.specs[0]!.content.length).toBeGreaterThan(0);
    expect(result.provenance.specs_included[0]!.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.provenance.specs_included[0]!.included_bytes).toBe(Buffer.byteLength(result.facts.specs[0]!.content, 'utf8'));
    expect(result.provenance.specs.truncated).toBe(true);
    expect(result.provenance.files.included_count).toBeLessThan(400);
    expect(result.provenance.blast.included_count).toBeLessThanOrEqual(64);
    expect(result.messages[1].content).not.toContain('�');
    expect(Buffer.byteLength(JSON.stringify(result.facts.specs), 'utf8')).toBeLessThanOrEqual(8000);
    expect(Buffer.byteLength(JSON.stringify(result.facts.files), 'utf8')).toBeLessThanOrEqual(5500);
  });
  it('fails fixed-envelope overflow before returning a request and reports unavailable sources honestly', () => {
    expect(() => prepareBriefInput(empty(), 'X'.repeat(33000))).toThrow('budget');
    const result = prepareBriefInput(empty());
    expect(result.provenance.intent.status).toBe('missing');
    expect(result.provenance.blast.status).toBe('unavailable');
    expect(result.provenance.files.status).toBe('missing');
    expect(result.provenance.linked_issue.reason).toBe('not_linked');
    expect(result.provenance.specs.status).toBe('missing');
  });
  it('never cuts a Unicode code point and caps valid positive new-side anchors', () => {
    expect(utf8Prefix('🙂éA', 5)).toBe('🙂');
    expect(candidateLines('@@ -1 +0,0 @@\n@@ -1 +2 @@\n@@ -1 +3,2 @@\n@@ -1 +4 @@\n@@ -1 +5 @@\n@@ -1 +6 @@')).toEqual([2, 3, 4, 5]);
  });
});
