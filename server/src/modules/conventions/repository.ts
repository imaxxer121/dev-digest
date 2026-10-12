import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
export type ConventionRow = typeof t.conventions.$inferSelect;
export type InsertConvention = typeof t.conventions.$inferInsert;
export class ConventionsRepository {
  constructor(private db: Db) {}
  async repo(workspaceId: string, id: string) {
    return (await this.db.select().from(t.repos).where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id))))[0];
  }
  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db.select().from(t.conventions).where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }
  async getById(workspaceId: string, id: string) {
    return (await this.db.select().from(t.conventions).where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id))))[0];
  }
  async update(workspaceId: string, id: string, data: Partial<Pick<ConventionRow, 'rule' | 'category' | 'status' | 'accepted'>>) {
    return (await this.db.update(t.conventions).set(data).where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id))).returning())[0];
  }
  async replaceForRepo(workspaceId: string, repoId: string, rows: InsertConvention[]) {
    await this.db.transaction(async tx => {
      const retained = await tx.select().from(t.conventions).where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
      const keys = new Set(retained.filter(r => r.status !== 'pending').map(r => r.rule));
      await tx.delete(t.conventions).where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'pending')));
      const fresh = rows.filter(r => !keys.has(r.rule));
      if (fresh.length) await tx.insert(t.conventions).values(fresh);
    });
    return this.listForRepo(workspaceId, repoId);
  }
}
