import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';
import { AppError, NotFoundError } from '../../../platform/errors.js';
import type { PrIntentRecord } from '../../../vendor/shared/contracts/review-api.js';

const intentScope = (workspaceId: string, prId: string) => and(eq(t.pullRequests.id, prId),
  eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId));
const intentRecord = (row: typeof t.prIntent.$inferSelect): PrIntentRecord => ({
  pr_id: row.prId, intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope,
  generation_id: row.generationId, head_sha: row.headSha, generated_at: row.generatedAt?.toISOString() ?? null,
  provider: row.provider, model: row.model, tokens_in: row.tokensIn, tokens_out: row.tokensOut, cost_usd: row.costUsd,
});

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function captureIntent(db: Db, workspaceId: string, prId: string) {
  return db.transaction(async tx => {
    // Lock the same PR row as head synchronization and saving. Never load patch/source.
    const [pull] = await tx.select({ title: t.pullRequests.title, body: t.pullRequests.body,
      headSha: t.pullRequests.headSha }).from(t.pullRequests).innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(intentScope(workspaceId, prId)).for('update', { of: t.pullRequests });
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await tx.select({ path: t.prFiles.path, additions: t.prFiles.additions,
      deletions: t.prFiles.deletions }).from(t.prFiles).where(eq(t.prFiles.prId, prId)).orderBy(t.prFiles.path);
    const [saved] = await tx.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return { title: pull.title, body: pull.body, headSha: pull.headSha, files, generationId: saved?.generationId ?? null };
  });
}

export async function getIntent(db: Db, workspaceId: string, prId: string) {
  const [row] = await db.select({ headSha: t.pullRequests.headSha, saved: t.prIntent }).from(t.pullRequests)
    .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).leftJoin(t.prIntent, eq(t.prIntent.prId, t.pullRequests.id))
    .where(intentScope(workspaceId, prId));
  if (!row) throw new NotFoundError('Pull request not found');
  return { headSha: row.headSha, intent: row.saved ? intentRecord(row.saved) : null };
}

export async function saveIntent(db: Db, workspaceId: string, prId: string,
  expected: { headSha: string; generationId: string | null }, record: PrIntentRecord) {
  return db.transaction(async tx => {
    const [pull] = await tx.select({ headSha: t.pullRequests.headSha }).from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).where(intentScope(workspaceId, prId))
      .for('update', { of: t.pullRequests });
    if (!pull) throw new NotFoundError('Pull request not found');
    if (pull.headSha !== expected.headSha) throw new AppError('intent_head_changed', 'PR head changed during classification. Recalculate explicitly.', 409);
    const [saved] = await tx.select({ generationId: t.prIntent.generationId }).from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if ((saved?.generationId ?? null) !== expected.generationId)
      throw new AppError('intent_result_changed', 'Another Intent was saved during classification. Reload before recalculating.', 409);
    const values = { intent: record.intent, inScope: record.in_scope, outOfScope: record.out_of_scope,
      generationId: record.generation_id, headSha: record.head_sha, generatedAt: record.generated_at ? new Date(record.generated_at) : null,
      provider: record.provider, model: record.model, tokensIn: record.tokens_in, tokensOut: record.tokens_out, costUsd: record.cost_usd };
    await tx.insert(t.prIntent).values({ prId, ...values }).onConflictDoUpdate({ target: t.prIntent.prId, set: values });
    return pull.headSha;
  });
}
