import type { AttributedFindingGroup, FindingRecord, MultiAgentMember } from '@devdigest/shared';

const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'for', 'and', 'with', 'this', 'can', 'may']);
const tokens = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter(t => t.length > 2 && !stop.has(t)));
/** Same category, intersecting ranges, and title-token Jaccard >= .35.
 * Every pair must match: no transitive chain merges unrelated ranges/issues.
 * This is a conservative heuristic, never a model verdict or replacement finding.
 */
export function sameIssue(a: FindingRecord, b: FindingRecord): boolean {
  if (a.file !== b.file || a.category !== b.category || a.start_line > b.end_line || b.start_line > a.end_line) return false;
  const x = tokens(a.title), y = tokens(b.title), union = new Set([...x, ...y]);
  return union.size > 0 && [...x].filter(t => y.has(t)).length / union.size >= .35;
}

export function groupFindings(members: MultiAgentMember[]): AttributedFindingGroup[] {
  const buckets: FindingRecord[][] = [];
  const originals = members.flatMap(m => m.review?.findings ?? [])
    .sort((a, b) => a.file.localeCompare(b.file) || a.start_line - b.start_line || a.id.localeCompare(b.id));
  for (const finding of originals) {
    const bucket = buckets.find(items => items.every(item => sameIssue(item, finding)));
    if (bucket) bucket.push(finding); else buckets.push([finding]);
  }
  return buckets.map(items => {
    const takes = members.map(member => {
      const ids = new Set(member.review?.findings.map(f => f.id) ?? []);
      const findings = items.filter(f => ids.has(f.id));
      return { run_id: member.run_id, agent_name: member.agent_name, findings,
        conclusion: findings.length ? 'flagged' as const : member.status === 'done' && member.review ? 'did_not_flag' as const : 'unknown' as const };
    });
    const severityDisagreement = takes.filter(t => t.findings.length > 0).length > 1 && new Set(items.map(f => f.severity)).size > 1;
    return { id: items.map(f => f.id).join(':'), file: items[0]!.file, title: items[0]!.title,
      start_line: Math.min(...items.map(f => f.start_line)), end_line: Math.max(...items.map(f => f.end_line)),
      takes, severity_disagreement: severityDisagreement,
      conflict: severityDisagreement || takes.some(t => t.conclusion === 'did_not_flag') };
  });
}
