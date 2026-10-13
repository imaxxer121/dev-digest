import type { EvalCounts, EvalMetrics, Finding, FrozenEvalCase, EvalDiffFile, EvalGroupResult } from '@devdigest/shared';
import { overlaps, strictGround } from './grounding.js';

export const emptyMetrics = (): EvalMetrics => ({ recall: null, precision: null, citation_accuracy: null });
export const emptyCounts = (): EvalCounts => ({ expected_positives: 0, true_positives: 0, false_negatives: 0, raw_candidates: 0, grounded_candidates: 0, false_positives: 0 });
export function metrics(counts: EvalCounts): EvalMetrics {
  return { recall: counts.expected_positives ? counts.true_positives / counts.expected_positives : null,
    precision: counts.raw_candidates ? counts.true_positives / counts.raw_candidates : null,
    citation_accuracy: counts.raw_candidates ? counts.grounded_candidates / counts.raw_candidates : null };
}

/** Pure positional maximum matching. Raw noise remains in every denominator. */
export function scoreGroup(cases: FrozenEvalCase[], candidates: Finding[], files: EvalDiffFile[]) {
  const gate = strictGround(candidates, files);
  const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));
  const negatives = sorted.filter(item => item.expected_output.kind === 'must_not_flag');
  const positives = sorted.filter(item => item.expected_output.kind === 'must_find');
  const negativeHits = new Set<number>();
  candidates.forEach((finding, index) => { if (negatives.some(item => overlaps(finding, item.expected_output))) negativeHits.add(index); });
  const usable = gate.indices.filter(index => !negativeHits.has(index));
  const assigned = new Map<number, string>();
  const byId = new Map(positives.map(item => [item.id, item]));
  const match = (id: string, visited: Set<number>): boolean => {
    for (const index of usable) {
      if (visited.has(index) || !overlaps(candidates[index]!, byId.get(id)!.expected_output)) continue;
      visited.add(index);
      const previous = assigned.get(index);
      if (previous === undefined || match(previous, visited)) { assigned.set(index, id); return true; }
    }
    return false;
  };
  positives.forEach(item => match(item.id, new Set()));
  const matches = new Map([...assigned].map(([index, id]) => [id, index]));
  const counts: EvalCounts = { expected_positives: positives.length, true_positives: matches.size, false_negatives: positives.length - matches.size,
    raw_candidates: candidates.length, grounded_candidates: gate.grounded.length, false_positives: candidates.length - matches.size };
  return { ...gate, counts, metrics: metrics(counts), case_results: sorted.map(item => ({ case_id: item.id,
    pass: item.expected_output.kind === 'must_find' ? matches.has(item.id) : !candidates.some(finding => overlaps(finding, item.expected_output)),
    matched_candidate_index: matches.get(item.id) ?? null })) };
}

export function aggregateGroups(groups: EvalGroupResult[], complete: boolean) {
  const success = groups.filter(group => group.status === 'completed' && group.counts);
  const counts = success.reduce((sum, group) => {
    for (const key of Object.keys(sum) as (keyof EvalCounts)[]) sum[key] += group.counts![key];
    return sum;
  }, emptyCounts());
  return { counts: success.length ? counts : null, metrics: complete ? metrics(counts) : emptyMetrics(),
    cost_usd: groups.some(group => group.cost_usd === null) ? null : groups.reduce((sum, group) => sum + group.cost_usd!, 0) };
}
