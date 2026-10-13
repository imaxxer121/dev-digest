import { and, desc, eq, sql, or, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { VerifiedCiArtifact, RunTrace } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { CiArtifactEnvelope } from './ports.js';
export type InstallationRow = typeof t.ciInstallations.$inferSelect;

export class CiRepository {
  constructor(private db: Db) {}
  async repo(workspaceId: string, name: string) { return (await this.db.select().from(t.repos).where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, name))))[0]; }
  async memory(workspaceId: string, repoId: string) { return this.db.select({ content: t.memory.content, kind: t.memory.kind }).from(t.memory).where(and(eq(t.memory.workspaceId, workspaceId), or(eq(t.memory.repoId, repoId), isNull(t.memory.repoId)))).limit(129); }
  async create(values: typeof t.ciInstallations.$inferInsert) { return (await this.db.insert(t.ciInstallations).values(values).returning())[0]!; }
  async get(workspaceId: string, id: string) { return (await this.db.select().from(t.ciInstallations).innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId)).where(and(eq(t.ciInstallations.id, id), eq(t.ciInstallations.workspaceId, workspaceId), eq(t.agents.workspaceId, workspaceId))))[0]?.ci_installations; }
  async installations(workspaceId: string, agentId?: string) {
    return (await this.db.select().from(t.ciInstallations).innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId)).where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.agents.workspaceId, workspaceId), agentId ? eq(t.agents.id, agentId) : undefined)).orderBy(desc(t.ciInstallations.installedAt))).map(row => row.ci_installations);
  }
  async runs(workspaceId: string, agentId?: string) {
    return (await this.db.select({ run: t.ciRuns, installation: t.ciInstallations }).from(t.ciRuns).innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id)).innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId)).where(and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciInstallations.workspaceId, workspaceId), eq(t.agents.workspaceId, workspaceId), agentId ? eq(t.agents.id, agentId) : undefined)).orderBy(desc(t.ciRuns.ranAt)).limit(200));
  }
  async ingest(workspaceId: string, installation: InstallationRow, envelope: CiArtifactEnvelope, artifact: VerifiedCiArtifact, trace: RunTrace) {
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${envelope.repositoryId}:${envelope.runId}:${envelope.attempt}`}, 0))`);
      const owner = await tx.select().from(t.ciInstallations).innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId)).where(and(eq(t.ciInstallations.id, installation.id), eq(t.ciInstallations.workspaceId, workspaceId), eq(t.agents.workspaceId, workspaceId)));
      if (!owner.length) throw new NotFoundError('CI installation not found');
      const [existing] = await tx.select().from(t.ciRuns).where(and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.githubRepositoryId, String(envelope.repositoryId)), eq(t.ciRuns.githubRunId, String(envelope.runId)), eq(t.ciRuns.githubRunAttempt, envelope.attempt)));
      if (existing) return { run: existing, created: false };
      const [repo] = await tx.select().from(t.repos).where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, installation.repo)));
      if (!repo) throw new NotFoundError('CI repository not imported');
      const [pull] = await tx.select().from(t.pullRequests).where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.repoId, repo.id), eq(t.pullRequests.number, artifact.pr_number)));
      const [run] = await tx.insert(t.agentRuns).values({ workspaceId, agentId: installation.agentId, prId: pull?.id ?? null, source: 'ci', status: 'done', provider: artifact.provider, model: artifact.model,
        tokensIn: artifact.tokens_in, tokensOut: artifact.tokens_out, costUsd: artifact.cost_usd, durationMs: artifact.duration_ms, findingsCount: artifact.findings_count, grounding: trace.stats.grounding,
        blockers: artifact.findings.filter(f => artifact.fail_on === 'any' || artifact.fail_on === 'warning' && f.severity !== 'SUGGESTION' || artifact.fail_on === 'critical' && f.severity === 'CRITICAL').length }).returning();
      await tx.insert(t.runTraces).values({ runId: run!.id, trace });
      if (pull) {
        const [review] = await tx.insert(t.reviews).values({ workspaceId, agentId: installation.agentId, prId: pull.id, runId: run!.id, kind: 'review', verdict: artifact.verdict, model: artifact.model, summary: 'Verified GitHub Actions review' }).returning();
        if (artifact.findings.length) await tx.insert(t.findings).values(artifact.findings.map(f => ({ reviewId: review!.id, file: f.file, startLine: f.start_line, endLine: f.end_line, severity: f.severity, category: f.category, title: f.title, rationale: f.rationale, suggestion: f.suggestion, confidence: f.confidence, kind: f.kind ?? 'finding' })));
      }
      const [row] = await tx.insert(t.ciRuns).values({ workspaceId, ciInstallationId: installation.id, githubRepositoryId: String(envelope.repositoryId), githubRunId: String(envelope.runId), githubRunAttempt: envelope.attempt, agentRunId: run!.id, artifact,
        prNumber: artifact.pr_number, ranAt: new Date(envelope.createdAt), status: artifact.verdict === 'request_changes' ? 'failed' : artifact.findings_count ? 'succeeded' : 'no_findings', findingsCount: artifact.findings_count,
        costUsd: artifact.cost_usd, githubUrl: envelope.htmlUrl, source: 'github_actions' }).returning();
      await tx.update(t.ciInstallations).set({ status: 'installed' }).where(and(eq(t.ciInstallations.id, installation.id), eq(t.ciInstallations.workspaceId, workspaceId)));
      return { run: row!, created: true };
    });
  }
}
