import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  symbol_file: z.string().optional(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  degraded: z.boolean().default(false),
  reason: z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']).nullish(),
  indexed_sha: z.string().nullish(),
  counts: z.object({
    symbols: z.number().int().nonnegative(),
    callers: z.number().int().nonnegative(),
    endpoints: z.number().int().nonnegative(),
    crons: z.number().int().nonnegative(),
  }).optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const ReviewFocus = z.object({
  file: z.string().min(1).max(1024),
  line: z.number().int().positive(),
  reason: z.string().min(1).max(1024),
}).strict();
export type ReviewFocus = z.infer<typeof ReviewFocus>;

export const BriefOutput = z.object({
  summary: z.string().min(1).max(1600),
  risks: z.array(Risk.extend({
    kind: z.string().min(1).max(80), title: z.string().min(1).max(180),
    explanation: z.string().min(1).max(2048),
    file_refs: z.array(z.string().min(1).max(1024)).min(1).max(16),
  }).strict()).max(8),
  review_focus: z.array(ReviewFocus).max(8),
}).strict();
export type BriefOutput = z.infer<typeof BriefOutput>;

export const BriefSource = z.object({
  source: z.string(), status: z.enum(['available', 'missing', 'unavailable']),
  reason: z.string().nullable(), truncated: z.boolean(),
  total_count: z.number().int().nonnegative(), included_count: z.number().int().nonnegative(),
});
export type BriefSource = z.infer<typeof BriefSource>;
export const BriefSpecSource = z.object({
  path: z.string(), digest: z.string().length(64),
  original_bytes: z.number().int().nonnegative(), included_bytes: z.number().int().nonnegative(),
});
export const BriefProvenance = z.object({
  description: BriefSource, intent: BriefSource, blast: BriefSource, files: BriefSource,
  linked_issue: BriefSource, specs: BriefSource,
  intent_sha_coverage: z.literal('unknown'), indexed_sha: z.string().nullable(),
  specs_included: z.array(BriefSpecSource),
});
export type BriefProvenance = z.infer<typeof BriefProvenance>;
export const BriefGeneration = z.object({
  call_id: z.string().uuid(), provider: z.string(), model: z.string(),
  application_calls: z.literal(1), attempts: z.literal(1),
  measured_payload_bytes: z.number().int().nonnegative(), adapter_framing_allowance_bytes: z.literal(1024),
  budgeted_input_bytes: z.number().int().max(32000), input_budget_bytes: z.literal(32000), budget_unit: z.literal('utf8_bytes'),
  tokens_in: z.number().int().nonnegative(), tokens_out: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative().nullable(), duration_ms: z.number().int().nonnegative(),
  discarded_refs: z.number().int().nonnegative(), discarded_risks: z.number().int().nonnegative(),
  discarded_focus: z.number().int().nonnegative(),
});
export type BriefGeneration = z.infer<typeof BriefGeneration>;
export const PrBrief = z.object({
  version: z.literal(1), head_sha: z.string().min(1), generated_at: z.string().datetime(),
  summary: BriefOutput.shape.summary, review_focus: z.array(ReviewFocus).max(8),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  history: PrHistory,
  provenance: BriefProvenance, generation: BriefGeneration,
});
export type PrBrief = z.infer<typeof PrBrief>;
export const BriefResponse = z.object({
  brief: PrBrief.nullable(), current_head_sha: z.string().min(1), stale: z.boolean(),
});
export type BriefResponse = z.infer<typeof BriefResponse>;
