import { and, eq } from 'drizzle-orm';
import type { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { dedupeSpecs } from '../context/helpers.js';

const scope = (workspaceId: string, prId: string) => and(eq(t.pullRequests.id, prId),
  eq(t.pullRequests.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId));

export class BriefRepository {
  constructor(private readonly db: Db) {}

  async read(workspaceId: string, prId: string) {
    const [row] = await this.db.select({ headSha: t.pullRequests.headSha, json: t.prBrief.json }).from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).leftJoin(t.prBrief, eq(t.prBrief.prId, t.pullRequests.id))
      .where(scope(workspaceId, prId));
    if (!row) throw new NotFoundError('Pull request not found');
    return row;
  }

  async capture(workspaceId: string, prId: string) {
    return this.db.transaction(async tx => {
      const [row] = await tx.select({ pull: t.pullRequests, repo: t.repos }).from(t.pullRequests)
        .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).where(scope(workspaceId, prId)).for('update', { of: t.pullRequests });
      if (!row) throw new NotFoundError('Pull request not found');
      const files = await tx.select({ path: t.prFiles.path, additions: t.prFiles.additions,
        deletions: t.prFiles.deletions, patch: t.prFiles.patch }).from(t.prFiles).where(eq(t.prFiles.prId, prId));
      const [intent] = await tx.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
      const specs = dedupeSpecs(await tx.select({ id: t.codeChunks.id, path: t.codeChunks.path, content: t.codeChunks.content })
        .from(t.codeChunks).where(and(eq(t.codeChunks.workspaceId, workspaceId), eq(t.codeChunks.repoId, row.repo.id), eq(t.codeChunks.source, 'spec'))));
      return { ...row, files, specs, intent: intent ? { intent: intent.intent, in_scope: intent.inScope, out_of_scope: intent.outOfScope } : null };
    });
  }

  async save(workspaceId: string, prId: string, expectedHead: string, document: PrBrief) {
    return this.db.transaction(async tx => {
      const [row] = await tx.select({ headSha: t.pullRequests.headSha }).from(t.pullRequests)
        .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).where(scope(workspaceId, prId)).for('update', { of: t.pullRequests });
      if (!row) throw new NotFoundError('Pull request not found');
      if (row.headSha !== expectedHead) throw new AppError('brief_head_changed', 'PR head changed during generation. Regenerate explicitly.', 409);
      await tx.insert(t.prBrief).values({ prId, json: document }).onConflictDoUpdate({ target: t.prBrief.prId, set: { json: document } });
      return row.headSha;
    });
  }
}
