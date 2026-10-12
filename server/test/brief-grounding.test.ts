import { describe, it, expect } from 'vitest';
import { BriefOutput } from '@devdigest/shared';
import { groundBrief } from '../src/modules/brief/grounding.js';

describe('Brief exact-path grounding', () => {
  it('keeps changed/caller refs, drops unknown refs and empty risks, preserving focus order', () => {
    const allowed = new Set(['helper.ts', 'routes.ts']);
    const risk = { kind: 'potential', title: 'Review helper contract', explanation: 'Check caller compatibility.', severity: 'medium', file_refs: ['helper.ts', 'routes.ts', 'helper.ts', '../helper.ts', '/helper.ts'] };
    const result = groundBrief({ summary: 'Refactors a shared helper.', risks: [risk, { ...risk, file_refs: ['spec.md', 'GET /route', 'unknown.ts'] }],
      review_focus: [{ file: 'routes.ts', line: 18, reason: 'Caller compatibility' }, { file: 'helper.ts', line: 2, reason: 'Check output shape' },
        { file: 'unknown.ts', line: 1, reason: 'Made up' }, { file: 'helper.ts', line: 2, reason: 'Duplicate' }] }, allowed);
    expect(result.risks[0]!.file_refs).toEqual(['helper.ts', 'routes.ts']);
    expect(result.risks).toHaveLength(1);
    expect(result.review_focus.map(f => f.file)).toEqual(['routes.ts', 'helper.ts']);
    expect(result.counts).toEqual({ discarded_refs: 5, discarded_risks: 1, discarded_focus: 2 });
  });
  it('supports truthful empty output and rejects malformed model shape without repair', () => {
    expect(groundBrief({ summary: 'Limited facts.', risks: [], review_focus: [] }, new Set()).risks).toEqual([]);
    expect(() => groundBrief({ summary: '', risks: [], review_focus: [] }, new Set())).toThrow();
    expect(BriefOutput.safeParse({ summary: 's', risks: [], review_focus: [{ file: 'x', line: 0, reason: 'r' }] }).success).toBe(false);
    expect(BriefOutput.safeParse({ summary: 's', risks: [], review_focus: [], surprise: true }).success).toBe(false);
  });
});
