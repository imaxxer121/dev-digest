import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import type { AgentRow } from '../../../db/rows.js';
import * as t from '../../../db/schema.js';
import { AppError } from '../../../platform/errors.js';
import type { Finding, RunTrace } from '@devdigest/shared';
import { RunCancelledError } from '../cancellation.js';
import * as reviewRepo from './review.repo.js';

/** Serialize final persistence with cancellation. An acknowledged cancellation
 * cannot be overwritten by a late response, nor leave a cancelled review behind.
 */
export async function persistOutcome(db: Db, review: Parameters<typeof reviewRepo.insertReview>[1] & { runId: string }, findings: Finding[],
  stats: { durationMs: number; tokensIn: number; tokensOut: number; costUsd: number | null; grounding: string; score: number; blockers: number }, head: string, trace: RunTrace) {
  return db.transaction(async tx => {
    const [run] = await tx.select().from(t.agentRuns).where(and(eq(t.agentRuns.id, review.runId),
      eq(t.agentRuns.workspaceId, review.workspaceId), eq(t.agentRuns.prId, review.prId))).for('update');
    if (!run || run.status !== 'running') throw new RunCancelledError();
    const saved = await reviewRepo.insertReview(tx, review);
    const rows = await reviewRepo.insertFindings(tx, saved.id, findings);
    await tx.insert(t.runTraces).values({ runId: review.runId, trace }).onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
    await tx.update(t.pullRequests).set({ lastReviewedSha: head }).where(eq(t.pullRequests.id, review.prId));
    await tx.update(t.agentRuns).set({ ...stats, status: 'done', error: null, findingsCount: rows.length }).where(eq(t.agentRuns.id, review.runId));
    return { review: saved, findings: rows };
  });
}

/** The parent snapshot and all child rows are visible together, or not at all. */
export async function createGroup(db: Db, workspaceId: string, prId: string, agents: AgentRow[]) {
  const groupId = randomUUID();
  const selected = agents.map(a => ({ run_id: randomUUID(), agent_id: a.id, agent_name: a.name }));
  await db.transaction(async tx => {
    const current = agents.length ? await tx.select().from(t.agents).where(and(
      inArray(t.agents.id, agents.map(a => a.id)), eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true))).for('share') : [];
    if (current.length !== agents.length || !agents.length || agents.length > 5 || new Set(agents.map(a => a.id)).size !== agents.length)
      throw new AppError('invalid_run_selection', 'Select 1–5 distinct enabled workspace agents', 422);
    await tx.insert(t.multiAgentRuns).values({ id: groupId, workspaceId, prId, selectedRuns: selected });
    await tx.insert(t.agentRuns).values(agents.map((a, i) => ({ id: selected[i]!.run_id, groupId, workspaceId,
      agentId: a.id, prId, provider: a.provider, model: a.model, status: 'running', source: 'local' as const })));
  });
  return { groupId, selected };
}

export async function groupsForPull(db: Db, workspaceId: string, prId: string) {
  const groups = await db.select().from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt));
  const ids = groups.flatMap(g => g.selectedRuns.map(s => s.run_id));
  const runs = ids.length ? await db.select().from(t.agentRuns).where(and(inArray(t.agentRuns.id, ids),
    eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId))) : [];
  return { groups, runs };
}

/** Check every workspace-bearing relationship before exposing trace, SSE or cancellation. */
export async function getScopedRun(db: Db, workspaceId: string, runId: string) {
  const [row] = await db.select({ run: t.agentRuns }).from(t.agentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId),
      eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId)));
  return row?.run;
}

/** Explicit Learn saves an idempotent local memory decision; it never calls a model. */
export async function learnFinding(db: Db, workspaceId: string, findingId: string) {
  return db.transaction(async tx => {
    const [ctx] = await tx.select({ finding: t.findings, review: t.reviews, pull: t.pullRequests }).from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId),
        eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId))).for('update', { of: t.findings });
    if (!ctx) return undefined;
    const [existing] = await tx.select().from(t.memory).where(and(eq(t.memory.workspaceId, workspaceId),
      sql`${t.memory.sources}->>'finding_id' = ${findingId}`)).limit(1);
    if (existing) return { memoryId: existing.id, finding: ctx.finding };
    const [memory] = await tx.insert(t.memory).values({ workspaceId, repoId: ctx.pull.repoId, scope: 'repo', kind: 'learning',
      content: `${ctx.finding.title}\n${ctx.finding.rationale}${ctx.finding.suggestion ? `\nSuggested fix: ${ctx.finding.suggestion}` : ''}`,
      confidence: ctx.finding.confidence, sources: { finding_id: findingId, review_id: ctx.review.id,
        file: ctx.finding.file, start_line: ctx.finding.startLine, source: 'explicit-user-learning' } }).returning();
    return { memoryId: memory!.id, finding: ctx.finding };
  });
}
