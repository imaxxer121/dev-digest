import { and, eq, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError, NotFoundError } from '../../platform/errors.js';

/** All live head writers share the PR row lock with brief capture/save. */
export class PullsRepository {
  constructor(private readonly db: Db) {}

  async readDetail(workspaceId: string, prId: string) {
    return this.db.transaction(async tx => {
      const [row] = await tx.select({ pull: t.pullRequests }).from(t.pullRequests)
        .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).where(and(eq(t.pullRequests.id, prId),
          eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId))).for('update', { of: t.pullRequests });
      if (!row) throw new NotFoundError('Pull request not found');
      const files = await tx.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
      const commits = await tx.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
      return { ...row, files, commits };
    });
  }

  async saveStats(workspaceId: string, prId: string, capturedHead: string, detail: PrDetail) {
    return this.db.transaction(async tx => {
      const [row] = await tx.select({ head: t.pullRequests.headSha }).from(t.pullRequests)
        .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).where(and(eq(t.pullRequests.id, prId),
          eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId))).for('update', { of: t.pullRequests });
      if (!row) throw new NotFoundError('Pull request not found');
      if (row.head !== capturedHead || row.head !== detail.head_sha) return false;
      await tx.update(t.pullRequests).set({ additions: detail.additions, deletions: detail.deletions, filesCount: detail.files_count })
        .where(eq(t.pullRequests.id, prId));
      return true;
    });
  }

  async syncMeta(workspaceId: string, repoId: string, pr: PrMeta) {
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pull-meta:${repoId}:${pr.number}`}))`);
      const [repo] = await tx.select({ id: t.repos.id }).from(t.repos)
        .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId))).for('share');
      if (!repo) throw new NotFoundError('Repository not found');
      const [existing] = await tx.select().from(t.pullRequests).where(and(eq(t.pullRequests.repoId, repoId),
        eq(t.pullRequests.number, pr.number), eq(t.pullRequests.workspaceId, workspaceId))).for('update');
      const changed = existing && existing.headSha !== pr.head_sha;
      if (changed) {
        await tx.delete(t.prFiles).where(eq(t.prFiles.prId, existing.id));
        await tx.delete(t.prCommits).where(eq(t.prCommits.prId, existing.id));
      }
      if (existing) {
        await tx.update(t.pullRequests).set({ title: pr.title, headSha: pr.head_sha, status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          ...(changed ? { body: null, additions: 0, deletions: 0, filesCount: 0 } : {}) }).where(eq(t.pullRequests.id, existing.id));
      } else {
        await tx.insert(t.pullRequests).values({ workspaceId, repoId, number: pr.number, title: pr.title,
          author: pr.author, branch: pr.branch, base: pr.base, headSha: pr.head_sha, status: pr.status,
          additions: pr.additions, deletions: pr.deletions, filesCount: pr.files_count,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null, updatedAt: pr.updated_at ? new Date(pr.updated_at) : null });
      }
    });
  }

  async saveDetail(workspaceId: string, prId: string, detail: PrDetail, expectedHead?: string) {
    return this.db.transaction(async tx => {
      const [row] = await tx.select({ pull: t.pullRequests }).from(t.pullRequests)
        .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).where(and(eq(t.pullRequests.id, prId),
          eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId))).for('update', { of: t.pullRequests });
      if (!row) throw new NotFoundError('Pull request not found');
      if (expectedHead !== undefined && row.pull.headSha !== expectedHead && row.pull.headSha !== detail.head_sha)
        throw new AppError('pr_detail_changed', 'A newer PR head was imported while detail was loading', 409);
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length) await tx.insert(t.prFiles).values(detail.files.map(f => ({ prId, path: f.path,
        additions: f.additions, deletions: f.deletions, patch: f.patch ?? null })));
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length) await tx.insert(t.prCommits).values(detail.commits.map(c => ({ prId, sha: c.sha,
        message: c.message, author: c.author, committedAt: c.committed_at ? new Date(c.committed_at) : null })));
      await tx.update(t.pullRequests).set({ headSha: detail.head_sha, title: detail.title, body: detail.body ?? null,
        additions: detail.additions, deletions: detail.deletions, filesCount: detail.files_count, status: detail.status,
        updatedAt: detail.updated_at ? new Date(detail.updated_at) : null }).where(eq(t.pullRequests.id, prId));
    });
  }
}
