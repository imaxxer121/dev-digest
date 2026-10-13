import { z } from 'zod';
import { Finding } from './findings';
import { Provider, ReviewStrategy, CiFailOn } from './knowledge';
import { PromptAssembly } from './trace';

/** Durable L06 evaluation DTOs. Legacy per-case scaffolding stays compatible. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const JsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(JsonValue), z.record(JsonValue),
]));
const uuid = z.string().uuid();
const count = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1).nullable();
const timestamp = z.string().datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const line = z.number().int().positive();

export const EvalDiffFile = z.object({
  path: z.string().min(1), additions: count, deletions: count,
  hunks: z.array(z.object({
    file: z.string().min(1), oldStart: count, oldLines: count,
    newStart: count, newLines: count, newLineNumbers: z.array(line),
  })),
});
export type EvalDiffFile = z.infer<typeof EvalDiffFile>;
export const EvalExpectation = z.object({
  kind: z.enum(['must_find', 'must_not_flag']), file: z.string().min(1), start_line: line, end_line: line,
}).refine(v => v.end_line >= v.start_line, { message: 'Expected range must be ordered', path: ['end_line'] });
export type EvalExpectation = z.infer<typeof EvalExpectation>;
export const EvalSource = z.object({
  workspace_id: uuid, repo_id: uuid, pr_id: uuid, pr_number: line, review_id: uuid, run_id: uuid,
  finding_id: uuid, agent_id: uuid, decision: z.enum(['accepted', 'dismissed']), decision_at: timestamp,
  source_head_sha: z.string().nullable(), diff_digest: digest,
  retrieval: z.enum(['trace-source-diff', 'trace-diff-block']),
});
export type EvalSource = z.infer<typeof EvalSource>;
export const EvalInputMeta = z.object({
  version: z.literal(1), profile: z.literal('diff-only-v1'), pr_title: z.string().nullable(),
  pr_description: z.string().nullable(), input_digest: digest, source: EvalSource,
});
export type EvalInputMeta = z.infer<typeof EvalInputMeta>;
export const FrozenEvalCase = z.object({
  id: uuid, owner_kind: z.literal('agent'), owner_id: uuid, name: z.string(), input_diff: z.string(),
  input_files: z.array(EvalDiffFile), input_meta: EvalInputMeta, expected_output: EvalExpectation,
  notes: z.string().nullable(), created_at: timestamp,
});
export type FrozenEvalCase = z.infer<typeof FrozenEvalCase>;
export const EvalCaseCollection = z.object({
  cases: z.array(FrozenEvalCase), unsupported: z.array(z.object({ id: uuid, name: z.string(), reason: z.string() })),
});
export type EvalCaseCollection = z.infer<typeof EvalCaseCollection>;
export const EvalCaseConversion = z.object({ case: FrozenEvalCase, created: z.boolean() });
export type EvalCaseConversion = z.infer<typeof EvalCaseConversion>;
export const EvalCounts = z.object({
  expected_positives: count, true_positives: count, false_negatives: count,
  raw_candidates: count, grounded_candidates: count, false_positives: count,
});
export type EvalCounts = z.infer<typeof EvalCounts>;
export const EvalMetrics = z.object({ recall: ratio, precision: ratio, citation_accuracy: ratio });
export type EvalMetrics = z.infer<typeof EvalMetrics>;
export const EvalProfile = z.object({
  id: z.literal('diff-only-v1'), runner_version: z.literal('1'), prompt_assembly_version: z.literal('1'),
  scorer_version: z.literal('1'), citation_gate_version: z.literal('1'), effective_schema: z.literal('Review'),
  schema_json: JsonValue, strategy: z.literal('single-pass'), max_retries: z.literal(0),
  context: z.literal('frozen-diff-pr-skills'),
});
export type EvalProfile = z.infer<typeof EvalProfile>;
export const EvalAgentSnapshot = z.object({
  id: uuid, name: z.string(), version: count, provider: Provider, model: z.string(), system_prompt: z.string(),
  strategy: ReviewStrategy, output_schema: JsonValue.nullable(), repo_intel: z.boolean(), ci_fail_on: CiFailOn,
});
export type EvalAgentSnapshot = z.infer<typeof EvalAgentSnapshot>;
export const EvalSkillSnapshot = z.object({
  id: uuid, name: z.string(), order: z.number().int(), version: count, body: z.string(), digest,
  enabled: z.boolean(),
});
export type EvalSkillSnapshot = z.infer<typeof EvalSkillSnapshot>;
export const EvalInputGroup = z.object({
  input_digest: digest, case_ids: z.array(uuid), input_diff: z.string(), input_files: z.array(EvalDiffFile),
  pr_title: z.string().nullable(), pr_description: z.string().nullable(),
});
export type EvalInputGroup = z.infer<typeof EvalInputGroup>;
export const EvalBatchSnapshot = z.object({
  version: z.literal(1), agent: EvalAgentSnapshot, skills: z.array(EvalSkillSnapshot),
  cases: z.array(FrozenEvalCase), groups: z.array(EvalInputGroup), profile: EvalProfile,
  dataset_digest: digest, config_digest: digest, comparison_key: digest,
});
export type EvalBatchSnapshot = z.infer<typeof EvalBatchSnapshot>;
export const EvalCaseResult = z.object({ case_id: uuid, pass: z.boolean().nullable(), matched_candidate_index: count.nullable() });
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;
export const EvalGroupResult = z.object({
  input_digest: digest, case_ids: z.array(uuid), status: z.enum(['pending', 'running', 'completed', 'failed']),
  error: z.string().nullable(), candidates: z.array(Finding), grounded: z.array(Finding),
  rejected: z.array(z.object({ candidate_index: count, reason: z.string() })), case_results: z.array(EvalCaseResult),
  counts: EvalCounts.nullable(), metrics: EvalMetrics, prompt_assembly: PromptAssembly.nullable(),
  raw_output: z.string().nullable(), structured_calls: count, structured_attempts: count.nullable(),
  tokens_in: count.nullable(), tokens_out: count.nullable(), cost_usd: z.number().nonnegative().nullable(), duration_ms: count,
});
export type EvalGroupResult = z.infer<typeof EvalGroupResult>;
export const EvalBatchSummary = z.object({
  id: uuid, agent_id: uuid, agent_name: z.string(), status: z.enum(['running', 'completed', 'partial', 'failed']),
  started_at: timestamp, completed_at: timestamp.nullable(), error: z.string().nullable(), provider: Provider,
  model: z.string(), agent_version: count, dataset_digest: digest, config_digest: digest, comparison_key: digest,
  cases_total: count, groups_total: count, groups_succeeded: count, groups_failed: count,
  cases_passed: count, cases_failed: count, counts: EvalCounts.nullable(), metrics: EvalMetrics,
  duration_ms: count.nullable(), cost_usd: z.number().nonnegative().nullable(),
});
export type EvalBatchSummary = z.infer<typeof EvalBatchSummary>;
export const EvalBatchDetail = EvalBatchSummary.extend({ snapshot: EvalBatchSnapshot, groups: z.array(EvalGroupResult) });
export type EvalBatchDetail = z.infer<typeof EvalBatchDetail>;
export const EvalBatchStarted = z.object({ batch_id: uuid, status: z.literal('running') });
export type EvalBatchStarted = z.infer<typeof EvalBatchStarted>;
export const EvalDashboardResponse = z.object({ latest: z.array(EvalBatchSummary), recent: z.array(EvalBatchSummary) });
export type EvalDashboardResponse = z.infer<typeof EvalDashboardResponse>;
