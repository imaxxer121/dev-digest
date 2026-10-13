import { z } from 'zod';
import { Finding, Verdict } from './findings';
import { Intent, SmartDiff } from './brief';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  group_id: z.string().optional(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** Intent persisted for a PR (the Intent plus the pr_id it scopes). */
export const PrIntentRecord = Intent.extend({ pr_id: z.string() });
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;

/** Explicit selections are exclusive with the backward-compatible single/all forms. */
export const ReviewSelection = z.object({
  agentId: z.string().uuid().optional(),
  agentIds: z.array(z.string().uuid()).min(1).max(5).optional(),
  all: z.literal(true).optional(),
}).strict().superRefine((value, ctx) => {
  if ([value.agentId, value.agentIds, value.all].filter(v => v !== undefined).length !== 1)
    ctx.addIssue({ code: 'custom', message: 'Provide exactly one of agentId, agentIds or all:true' });
  if (value.agentIds && new Set(value.agentIds).size !== value.agentIds.length)
    ctx.addIssue({ code: 'custom', path: ['agentIds'], message: 'Duplicate agents are not allowed' });
});

export const MultiAgentMember = z.object({
  run_id: z.string(), agent_id: z.string(), agent_name: z.string(),
  status: z.enum(['running', 'done', 'failed', 'cancelled', 'deleted']),
  error: z.string().nullable(), duration_ms: z.number().nullable(), cost_usd: z.number().nullable(),
  tokens_in: z.number().nullable(), tokens_out: z.number().nullable(),
  review: ReviewRecord.nullable(),
});
export type MultiAgentMember = z.infer<typeof MultiAgentMember>;
export const FindingGroupTake = z.object({
  run_id: z.string(), agent_name: z.string(),
  conclusion: z.enum(['flagged', 'did_not_flag', 'unknown']),
  findings: z.array(FindingRecord),
});
export const AttributedFindingGroup = z.object({
  id: z.string(), file: z.string(), start_line: z.number().int(), end_line: z.number().int(),
  title: z.string(), conflict: z.boolean(), severity_disagreement: z.boolean(),
  takes: z.array(FindingGroupTake),
});
export type AttributedFindingGroup = z.infer<typeof AttributedFindingGroup>;
export const MultiAgentReviewRecord = z.object({
  id: z.string(), pr_id: z.string(), ran_at: z.string(),
  members: z.array(MultiAgentMember), groups: z.array(AttributedFindingGroup),
});
export type MultiAgentReviewRecord = z.infer<typeof MultiAgentReviewRecord>;
export const MultiAgentReviewCollection = z.object({ groups: z.array(MultiAgentReviewRecord) });
