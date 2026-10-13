import { randomUUID } from 'node:crypto';
import type { EvalAgentSnapshot, EvalSkillSnapshot, Finding, FrozenEvalCase } from '@devdigest/shared';
import { freezeFile } from '../../src/modules/evals/source.js';
import { inputDigest, textDigest } from '../../src/modules/evals/digest.js';

export const DIFF = 'diff --git a/src/check.ts b/src/check.ts\nindex 11..22 100644\n--- a/src/check.ts\n+++ b/src/check.ts\n@@ -10,3 +10,4 @@\n keep\n-old\n+new\n+extra\n tail\n';
export const FILE = 'src/check.ts';
export function agentSnapshot(overrides: Partial<EvalAgentSnapshot> = {}): EvalAgentSnapshot {
  return { id: randomUUID(), name: 'Agent', version: 1, provider: 'anthropic', model: 'fixture', system_prompt: 'SYSTEM_SNAPSHOT',
    strategy: 'map-reduce', output_schema: { configured: true }, repo_intel: true, ci_fail_on: 'critical', ...overrides };
}
export function skillSnapshot(overrides: Partial<EvalSkillSnapshot> = {}): EvalSkillSnapshot {
  const body = overrides.body ?? 'SKILL_SNAPSHOT';
  return { id: randomUUID(), name: 'Skill', order: 0, version: 1, body, digest: textDigest(body), enabled: true, ...overrides };
}
export function frozenCase(overrides: Partial<FrozenEvalCase> = {}): FrozenEvalCase {
  const fragment = freezeFile(DIFF, FILE);
  const agentId = randomUUID();
  return { id: randomUUID(), owner_kind: 'agent', owner_id: agentId, name: 'LABEL_SENTINEL', input_diff: fragment.raw,
    input_files: [fragment.file], notes: 'NOTES_SENTINEL', created_at: '2026-10-13T00:00:00.000Z',
    expected_output: { kind: 'must_find', file: FILE, start_line: 11, end_line: 11 },
    input_meta: { version: 1, profile: 'diff-only-v1', pr_title: null, pr_description: null, input_digest: inputDigest(fragment.raw, null, null),
      source: { workspace_id: randomUUID(), repo_id: randomUUID(), pr_id: randomUUID(), pr_number: 1, review_id: randomUUID(), run_id: randomUUID(),
        finding_id: randomUUID(), agent_id: agentId, decision: 'accepted', decision_at: '2026-10-13T00:00:00.000Z', source_head_sha: null,
        diff_digest: textDigest(fragment.raw), retrieval: 'trace-diff-block' } }, ...overrides };
}
export function candidate(start = 11, end = start, overrides: Partial<Finding> = {}): Finding {
  return { id: 'candidate', file: FILE, start_line: start, end_line: end, severity: 'WARNING', category: 'bug', title: 'Candidate',
    rationale: 'Fixture reasoning', suggestion: null, confidence: 1, ...overrides };
}
