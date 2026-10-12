import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import { dedupeSpecs } from './helpers.js';

/** Logical text attachments only; never opens their names on the filesystem. */
export class ContextRepository {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string, repoId: string) {
    const [repo] = await this.db.select({ id: t.repos.id }).from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    if (!repo) throw new NotFoundError('Repository not found');
    return dedupeSpecs(await this.db.select({ id: t.codeChunks.id, path: t.codeChunks.path, content: t.codeChunks.content })
      .from(t.codeChunks).where(and(eq(t.codeChunks.workspaceId, workspaceId), eq(t.codeChunks.repoId, repoId), eq(t.codeChunks.source, 'spec'))));
  }

  async save(workspaceId: string, repoId: string, input: { path: string; content: string }) {
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`context:${workspaceId}:${repoId}`}))`);
      const [repo] = await tx.select({ id: t.repos.id }).from(t.repos)
        .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId))).for('share');
      if (!repo) throw new NotFoundError('Repository not found');
      await tx.delete(t.codeChunks).where(and(eq(t.codeChunks.workspaceId, workspaceId), eq(t.codeChunks.repoId, repoId),
        eq(t.codeChunks.source, 'spec'), eq(t.codeChunks.path, input.path)));
      await tx.insert(t.codeChunks).values({ workspaceId, repoId, path: input.path, content: input.content, source: 'spec', embedding: null });
      return { path: input.path, content: input.content, size: Buffer.byteLength(input.content, 'utf8'), updated_at: null };
    });
  }
}
