import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';
import type { Extraction } from './constants.js';
export function groundEvidence(candidate: Extraction['conventions'][number], byPath: Map<string, string>) {
  const content = byPath.get(candidate.evidence_path);
  if (!content || !candidate.evidence_snippet.trim()) return null;
  const offset = content.indexOf(candidate.evidence_snippet);
  if (offset < 0) return null;
  return { ...candidate, evidence_line: content.slice(0, offset).split('\n').length };
}
export function toCandidate(row: ConventionRow): ConventionCandidate {
  return { id: row.id, category: row.category, rule: row.rule, evidence_path: row.evidencePath ?? '', evidence_line: row.evidenceLine, evidence_snippet: row.evidenceSnippet ?? '', confidence: row.confidence ?? 0, status: row.status, accepted: row.status === 'accepted' };
}
export function conventionSkillBody(rows: ConventionRow[]): string {
  return '# Repository conventions\n\n' + rows.map(row => `## ${row.category}\n\n${row.rule}\n\nEvidence: \`${row.evidencePath}:${row.evidenceLine}\`\n\n\`\`\`\n${row.evidenceSnippet}\n\`\`\``).join('\n\n');
}
