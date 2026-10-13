import { describe, expect, it } from 'vitest';
import { ReviewSelection, type FindingRecord, type MultiAgentMember } from '@devdigest/shared';
import { groupFindings, sameIssue } from '../src/modules/reviews/grouping.js';

const finding = (id: string, patch: Partial<FindingRecord> = {}): FindingRecord => ({ id, review_id: `review-${id}`, accepted_at: null, dismissed_at: null,
  file: 'auth.ts', start_line: 10, end_line: 12, title: 'Missing workspace authorization check', category: 'security', severity: 'CRITICAL',
  rationale: 'Tenant data is exposed.', confidence: .95, ...patch });
const member = (id: string, findings: FindingRecord[], status: MultiAgentMember['status'] = 'done'): MultiAgentMember => ({
  run_id: id, agent_id: id, agent_name: id, status, error: null, duration_ms: null, cost_usd: null, tokens_in: null, tokens_out: null,
  review: status === 'done' ? { id: `review-${id}`, pr_id: 'pr', agent_id: id, run_id: id, kind: 'review', verdict: 'comment', summary: null, score: 70, model: 'fixture',
    created_at: '2026-10-13T10:00:00Z', findings } : null });

describe('conservative attributed finding groups', () => {
  it('keeps all original findings and explicit severity disagreement', () => {
    const a = finding('a'), b = finding('b', { severity: 'WARNING', title: 'Workspace authorization check missing' });
    const groups = groupFindings([member('a', [a]), member('b', [b])]);
    expect(groups).toHaveLength(1); expect(groups[0]).toMatchObject({ conflict: true, severity_disagreement: true });
    expect(groups[0]!.takes.flatMap(t => t.findings)).toEqual([a, b]);
  });
  it('distinguishes a completed negative from failed, cancelled, running and deleted unknown peers', () => {
    const members = [member('flag', [finding('a')]), member('negative', []), ...(['failed', 'cancelled', 'running', 'deleted'] as const).map(s => member(s, [], s))];
    const [group] = groupFindings(members);
    expect(group!.takes.map(t => t.conclusion)).toEqual(['flagged', 'did_not_flag', 'unknown', 'unknown', 'unknown', 'unknown']); expect(group!.conflict).toBe(true);
  });
  it('never calls an unavailable completed review a negative', () => {
    const lost = { ...member('lost', []), review: null };
    const [group] = groupFindings([member('flag', [finding('a')]), lost, member('failed', [], 'failed')]);
    expect(group!.takes[1]!.conclusion).toBe('unknown'); expect(group!.conflict).toBe(false);
  });
  it('separates different files, ranges, categories and unrelated issues at the same line', () => {
    const a = finding('a');
    for (const patch of [{ file: 'other.ts' }, { start_line: 20, end_line: 21 }, { category: 'perf' as const }, { title: 'Quadratic iteration wastes CPU' }])
      expect(sameIssue(a, finding('b', patch))).toBe(false);
  });
  it('avoids transitive range chains', () => {
    const groups = groupFindings([member('one', [finding('a', { start_line: 1, end_line: 3 }), finding('b', { start_line: 3, end_line: 5 }), finding('c', { start_line: 5, end_line: 7 })])]);
    expect(groups).toHaveLength(2);
  });
  it('does not label one agent’s duplicate severity variation as an inter-agent disagreement', () => {
    const [group] = groupFindings([member('one', [finding('a'), finding('b', { severity: 'WARNING' })])]);
    expect(group).toMatchObject({ severity_disagreement: false, conflict: false });
  });
});
describe('explicit selection transport validation', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it.each([{}, { agentIds: [] }, { agentIds: [id, id] }, { agentIds: Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`) },
    { agentIds: [id], agentId: id }, { agentIds: ['not-a-uuid'] }, { all: false }, { all: true, unexpected: true }])('rejects malformed selection %j', payload => {
    expect(ReviewSelection.safeParse(payload).success).toBe(false);
  });
  it('retains exclusive single-agent and all-enabled request compatibility', () => {
    expect(ReviewSelection.safeParse({ agentId: id }).success).toBe(true); expect(ReviewSelection.safeParse({ all: true }).success).toBe(true);
  });
});
