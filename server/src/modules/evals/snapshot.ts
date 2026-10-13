import { assemblePrompt, toJsonSchema, wrapUntrusted } from '@devdigest/reviewer-core';
import { EvalBatchSnapshot, EvalProfile, Review, JsonValue, type EvalAgentSnapshot, type EvalSkillSnapshot, type FrozenEvalCase, type EvalInputGroup, type EvalBatchDetail, type EvalGroupResult } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { canonical, digest, inputDigest, textDigest, effectiveDescription } from './digest.js';
import { parseStrictDiff } from './source.js';
import { citationReason, overlaps } from './grounding.js';
import { MAX_CASES, MAX_GROUPS, MAX_SNAPSHOT_BYTES, MAX_INPUT_BYTES, MAX_FILE_BYTES } from './constants.js';
import { emptyMetrics, aggregateGroups } from './scorer.js';

export const effectiveProfile = () => EvalProfile.parse({ id: 'diff-only-v1', runner_version: '1', prompt_assembly_version: '1', scorer_version: '1',
  citation_gate_version: '1', effective_schema: 'Review', schema_json: toJsonSchema(Review, 'Review').schema,
  strategy: 'single-pass', max_retries: 0, context: 'frozen-diff-pr-skills' });

export function validateFrozen(item: FrozenEvalCase) {
  if (Buffer.byteLength(item.input_diff, 'utf8') > MAX_FILE_BYTES) throw new Error('Frozen file diff exceeds 65,536 UTF-8 bytes');
  const parsed = parseStrictDiff(item.input_diff);
  if (parsed.length !== 1 || canonical(JsonValue.parse(parsed.map(part => part.file))) !== canonical(JsonValue.parse(item.input_files))) throw new Error('Frozen diff metadata does not match exact body rows');
  if (citationReason(item.expected_output, item.input_files)) throw new Error('Expected location does not intersect a real new-side row');
  if (textDigest(item.input_diff) !== item.input_meta.source.diff_digest || inputDigest(item.input_diff, item.input_meta.pr_title, item.input_meta.pr_description) !== item.input_meta.input_digest) throw new Error('Frozen input digest mismatch');
}

export function groupPrompt(agent: EvalAgentSnapshot, skills: EvalSkillSnapshot[], group: EvalInputGroup) {
  if ((group.pr_description?.length ?? 0) > 4000) throw new AppError('eval_input_unsupported', 'Frozen PR description exceeds the shared prompt profile limit', 409);
  const task = 'Review the entire frozen diff. Report distinct defensible findings with exact file and line ranges; zero findings is valid.' +
    (group.pr_title !== null ? `\n${wrapUntrusted('pr-title', group.pr_title)}` : '');
  return assemblePrompt({ system: agent.system_prompt, skills: skills.filter(skill => skill.enabled).map(skill => skill.body), diff: group.input_diff,
    prDescription: group.pr_description ?? undefined, task });
}

export function buildSnapshot(agent: EvalAgentSnapshot, skills: EvalSkillSnapshot[], cases: FrozenEvalCase[]) {
  if (!cases.length || cases.length > MAX_CASES) throw new AppError('eval_suite_unsupported', 'Eval suite must contain 1–128 valid frozen cases', 409);
  const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, EvalInputGroup>();
  for (const item of sorted) {
    validateFrozen(item);
    const key = item.input_meta.input_digest;
    const existing = groups.get(key);
    if (existing) existing.case_ids.push(item.id);
    else groups.set(key, { input_digest: key, case_ids: [item.id], input_diff: item.input_diff, input_files: item.input_files,
      pr_title: item.input_meta.pr_title, pr_description: effectiveDescription(item.input_meta.pr_description) });
  }
  if (groups.size > MAX_GROUPS) throw new AppError('eval_suite_unsupported', 'Eval suite exceeds 32 distinct inputs', 409);
  const profile = effectiveProfile();
  for (const group of groups.values()) {
    const members = sorted.filter(item => group.case_ids.includes(item.id));
    if (members.some(a => members.some(b => a.expected_output.kind !== b.expected_output.kind && overlaps(a.expected_output, b.expected_output)))) throw new AppError('eval_suite_contradictory', 'Positive and negative targets overlap for the same input', 409);
    const prompt = groupPrompt(agent, skills, group);
    if (Buffer.byteLength(JSON.stringify({ messages: prompt.messages, schema: profile.schema_json }), 'utf8') > MAX_INPUT_BYTES) throw new AppError('eval_input_oversize', 'Serialized eval input exceeds 128 KiB; frozen input was not shortened', 409);
  }
  const datasetDigest = digest(JsonValue.parse(sorted.map(item => ({ id: item.id, input_diff: item.input_diff, input_files: item.input_files,
    title: item.input_meta.pr_title, description: effectiveDescription(item.input_meta.pr_description), expectation: item.expected_output }))));
  const configDigest = digest(JsonValue.parse({ agent, skills: skills.filter(skill => skill.enabled) }));
  const comparisonKey = digest({ dataset_digest: datasetDigest, profile: JsonValue.parse(profile) });
  const snapshot = EvalBatchSnapshot.parse({ version: 1, agent, skills, cases: sorted, groups: [...groups.values()].sort((a, b) => a.input_digest.localeCompare(b.input_digest)),
    profile, dataset_digest: datasetDigest, config_digest: configDigest, comparison_key: comparisonKey });
  if (Buffer.byteLength(canonical(JsonValue.parse(snapshot)), 'utf8') > MAX_SNAPSHOT_BYTES) throw new AppError('eval_snapshot_oversize', 'Canonical batch snapshot exceeds 16 MiB', 409);
  return snapshot;
}

export function pendingGroup(group: EvalInputGroup): EvalGroupResult {
  return { input_digest: group.input_digest, case_ids: group.case_ids, status: 'pending', error: null, candidates: [], grounded: [], rejected: [],
    case_results: group.case_ids.map(case_id => ({ case_id, pass: null, matched_candidate_index: null })), counts: null, metrics: emptyMetrics(),
    prompt_assembly: null, raw_output: null, structured_calls: 0, structured_attempts: null, tokens_in: null, tokens_out: null, cost_usd: null, duration_ms: 0 };
}

export function initialBatch(id: string, startedAt: string, snapshot: EvalBatchSnapshot): EvalBatchDetail {
  return { id, agent_id: snapshot.agent.id, agent_name: snapshot.agent.name, status: 'running', started_at: startedAt, completed_at: null, error: null,
    provider: snapshot.agent.provider, model: snapshot.agent.model, agent_version: snapshot.agent.version,
    dataset_digest: snapshot.dataset_digest, config_digest: snapshot.config_digest, comparison_key: snapshot.comparison_key,
    cases_total: snapshot.cases.length, groups_total: snapshot.groups.length, groups_succeeded: 0, groups_failed: 0, cases_passed: 0, cases_failed: 0,
    counts: null, metrics: emptyMetrics(), duration_ms: null, cost_usd: null, snapshot, groups: snapshot.groups.map(pendingGroup) };
}

export function summarize(detail: EvalBatchDetail, terminal = false, error: string | null = null): EvalBatchDetail {
  const succeeded = detail.groups.filter(group => group.status === 'completed').length;
  const failed = detail.groups.filter(group => group.status === 'failed').length;
  const completed = terminal && !error && succeeded === detail.groups.length;
  return { ...detail, status: terminal ? (completed ? 'completed' : succeeded && !error ? 'partial' : 'failed') : 'running',
    completed_at: terminal ? new Date().toISOString() : null, error,
    groups_succeeded: succeeded, groups_failed: failed,
    cases_passed: detail.groups.flatMap(group => group.case_results).filter(result => result.pass === true).length,
    cases_failed: detail.groups.flatMap(group => group.case_results).filter(result => result.pass === false).length,
    duration_ms: terminal ? Date.now() - Date.parse(detail.started_at) : null, ...aggregateGroups(detail.groups, completed) };
}
