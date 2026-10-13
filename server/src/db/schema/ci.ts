import { pgTable, uuid, text, integer, timestamp, doublePrecision, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { workspaces } from './core';

export const ciInstallations = pgTable('ci_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  repo: text('repo').notNull(),
  targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('exported'),
  manifestDigest: text('manifest_digest').notNull().default(''),
  workflowDigest: text('workflow_digest').notNull().default(''),
  runtimeProvider: text('runtime_provider').notNull().default('openrouter'),
  runtimeModel: text('runtime_model').notNull().default(''),
  failOn: text('fail_on').notNull().default('critical'),
  workflowVersion: text('workflow_version').notNull().default('2'),
  bundleDigests: jsonb('bundle_digests').$type<Record<string, string>>().notNull().default({}),
});

export const ciRuns = pgTable('ci_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  prNumber: integer('pr_number'),
  ranAt: timestamp('ran_at', { withTimezone: true }),
  status: text('status'),
  findingsCount: integer('findings_count'),
  costUsd: doublePrecision('cost_usd'),
  githubUrl: text('github_url'),
  source: text('source'),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  githubRunId: text('github_run_id'),
  githubRepositoryId: text('github_repository_id'),
  githubRunAttempt: integer('github_run_attempt'),
  agentRunId: uuid('agent_run_id'),
  artifact: jsonb('artifact'),
}, table => ({ identity: uniqueIndex('ci_runs_identity').on(table.workspaceId, table.githubRepositoryId, table.githubRunId, table.githubRunAttempt) }));
