import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, uniqueIndex } from 'drizzle-orm/pg-core';
import type { EvalBatchSnapshot, EvalBatchDetail } from '@devdigest/shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
  sourceFindingId: uuid('source_finding_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => ({ sourceIdentity: uniqueIndex('eval_case_source_uq').on(t.workspaceId, t.ownerKind, t.ownerId, t.sourceFindingId).where(sql`${t.sourceFindingId} IS NOT NULL`) }));

export const evalBatches = pgTable('eval_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull(),
  status: text('status', { enum: ['running', 'completed', 'partial', 'failed'] }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  snapshot: jsonb('snapshot').$type<EvalBatchSnapshot>().notNull(),
  result: jsonb('result').$type<EvalBatchDetail>().notNull(),
  error: text('error'),
}, t => ({ running: uniqueIndex('eval_batch_running_uq').on(t.workspaceId, t.agentId).where(sql`${t.status} = 'running'`) }));

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => evalCases.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  actualOutput: jsonb('actual_output'),
  pass: boolean('pass'),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  durationMs: integer('duration_ms'),
  costUsd: doublePrecision('cost_usd'),
  batchId: uuid('batch_id').references(() => evalBatches.id, { onDelete: 'cascade' }),
  inputDigest: text('input_digest'),
}, t => ({ member: uniqueIndex('eval_run_batch_case_uq').on(t.batchId, t.caseId).where(sql`${t.batchId} IS NOT NULL`) }));

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
