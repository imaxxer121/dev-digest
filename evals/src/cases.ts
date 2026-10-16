import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from './paths.js';
import type { HarnessCase, Suite } from './types.js';

const concepts = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 12 && value.every(group => Array.isArray(group) && group.length > 0 && group.length <= 12 && group.every(term => typeof term === 'string' && term.trim().length > 0 && term.length <= 200));
const objectKeys = (value: unknown, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));

export function canonicalPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\\:\x00-\x1f\x7f]/.test(value) &&
    !value.startsWith('/') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !/[. ]$/.test(part));
}
export function validateCases(input: unknown): HarnessCase[] {
  if (!Array.isArray(input) || !input.length || input.length > 24) throw new Error('Expected 1–24 harness cases');
  const ids = new Set<string>();
  for (const c of input) {
    if (!c || !/^[a-z][a-z0-9-]+$/.test(c.id) || ids.has(c.id)) throw new Error('Invalid or duplicate case id');
    ids.add(c.id);
    if (!['skills', 'agents', 'workflow'].includes(c.suite) || typeof c.name !== 'string' || typeof c.prompt !== 'string' || c.prompt.length < 30 || c.prompt.length > 12000) throw new Error(`Invalid case ${c.id}`);
    if (c.candidateInstructions !== undefined && (typeof c.candidateInstructions !== 'string' || !c.candidateInstructions.trim() || c.candidateInstructions.length > 4000)) throw new Error('Invalid candidate instructions');
    if (!Array.isArray(c.files) || !c.files.length || c.files.length > 32 || !c.files.every(canonicalPath)) throw new Error(`Invalid source list ${c.id}`);
    if (c.artifact !== undefined && !canonicalPath(c.artifact)) throw new Error('Invalid artifact path');
    if (c.nativeSkill !== undefined && !/^[a-z][a-z0-9-]+$/.test(c.nativeSkill)) throw new Error('Invalid skill name');
    if (!c.expect || !['PASS', 'FAIL', 'REVIEW'].includes(c.expect.verdict)) throw new Error('Expected verdict required');
    for (const key of ['reads', 'forbiddenReads', 'absentFiles']) if (c.expect[key] !== undefined && (!Array.isArray(c.expect[key]) || !c.expect[key].every(canonicalPath))) throw new Error('Invalid expected paths');
    for (const key of ['minFindings', 'maxFindings']) if (c.expect[key] !== undefined && (!Number.isSafeInteger(c.expect[key]) || c.expect[key] < 0 || c.expect[key] > 20)) throw new Error('Invalid findings bound');
    if (c.expect.evidence !== undefined && (!Array.isArray(c.expect.evidence) || c.expect.evidence.some((value: unknown) => typeof value !== 'string' || !value))) throw new Error('Invalid evidence rubric');
    for (const key of ['noTools', 'noDelegation']) if (c.expect[key] !== undefined && typeof c.expect[key] !== 'boolean') throw new Error('Invalid absence rubric');
    if (c.expect.summaryConcepts !== undefined) {
      const summaries = c.expect.summaryConcepts;
      if (!Array.isArray(summaries) || summaries.length < 1 || summaries.length > 8 || summaries.some(summary => !objectKeys(summary, ['name', 'concepts']) || typeof summary.name !== 'string' || !summary.name.trim() || summary.name.length > 100 || !concepts(summary.concepts)) || new Set(summaries.map(summary => summary.name)).size !== summaries.length) throw new Error('Invalid summary concepts rubric');
    }
    if (c.expect.answerRubric !== undefined) {
      const rubric = c.expect.answerRubric;
      if (!objectKeys(rubric, ['kind', 'discoveryConcepts', 'consequenceConcepts', 'source', 'verification']) || rubric.kind !== 'insight' || !concepts(rubric.discoveryConcepts) || !concepts(rubric.consequenceConcepts)) throw new Error('Invalid structured answer rubric');
      if (!objectKeys(rubric.source, ['file', 'line', 'evidence']) || !canonicalPath(rubric.source.file) || !c.files.includes(rubric.source.file) || !Number.isSafeInteger(rubric.source.line) || rubric.source.line < 1 || typeof rubric.source.evidence !== 'string' || !rubric.source.evidence.trim()) throw new Error('Invalid insight source rubric');
      if (!objectKeys(rubric.verification, ['provenance', 'evidence', 'resultConcepts']) || rubric.verification.provenance !== 'user_report' || typeof rubric.verification.evidence !== 'string' || !rubric.verification.evidence.trim() || !c.prompt.includes(rubric.verification.evidence) || !concepts(rubric.verification.resultConcepts)) throw new Error('Insight verification rubric must refer to supplied case evidence');
    }
  }
  return input as HarnessCase[];
}
export async function loadCases(suite?: Suite): Promise<HarnessCase[]> {
  const cases = validateCases(JSON.parse(await readFile(join(PACKAGE_ROOT, 'cases.json'), 'utf8')));
  return suite ? cases.filter(c => c.suite === suite) : cases;
}
