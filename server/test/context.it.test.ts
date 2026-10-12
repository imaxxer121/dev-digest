import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { SpecFile } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const enabled = await dockerAvailable();
(enabled ? describe : describe.skip)('Project Context attachments (PostgreSQL)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let repoId: string;
  let foreignRepoId: string;
  let foreignWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId,
      owner: 'context', name: 'fixture', fullName: 'context/fixture' }).returning();
    repoId = repo!.id;
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-context' }).returning();
    foreignWorkspaceId = foreign!.id;
    const [foreignRepo] = await pg.handle.db.insert(t.repos).values({ workspaceId: foreignWorkspaceId,
      owner: 'foreign', name: 'context', fullName: 'foreign/context' }).returning();
    foreignRepoId = foreignRepo!.id;
    app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      db: pg.handle.db, overrides: { secrets: { get: async () => undefined } } });
    for (const method of ['llm', 'github', 'embedder'] as const) {
      vi.spyOn(app.container, method).mockImplementation(async () => { throw new Error('Unexpected attachment I/O'); });
    }
    for (const property of ['git', 'codeIndex', 'repoIntel', 'tokenizer'] as const) {
      vi.spyOn(app.container, property, 'get').mockImplementation(() => { throw new Error('Unexpected attachment I/O'); });
    }
  });
  afterAll(async () => { await app?.close(); await pg?.stop(); });

  it('saves Unicode text and reloads only scoped specs with UTF-8 sizes and no reads that mutate', async () => {
    const content = 'Review café and Ж API behavior 🧭';
    await pg.handle.db.insert(t.codeChunks).values([
      { workspaceId, repoId, source: 'code', path: 'hidden-code.ts', content: 'code sentinel' },
      { workspaceId: foreignWorkspaceId, repoId, source: 'spec', path: 'foreign-in-owned.md', content: 'foreign sentinel' },
      { workspaceId: foreignWorkspaceId, repoId: foreignRepoId, source: 'spec', path: 'foreign.md', content: 'foreign sentinel' },
    ]);
    const saved = await app.inject({ method: 'PUT', url: `/repos/${repoId}/context`,
      payload: { path: 'specs/Unicode 茶.md', content } });
    expect(saved.statusCode).toBe(200);
    expect(SpecFile.parse(saved.json())).toEqual({ path: 'specs/Unicode 茶.md', content,
      size: Buffer.byteLength(content, 'utf8'), updated_at: null });
    const writes = ['insert', 'update', 'delete'].map((method) => vi.spyOn(pg.handle.db, method as 'insert'));
    try {
      const reload = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(reload.statusCode).toBe(200);
      expect(reload.json()).toEqual([saved.json()]);
      for (const write of writes) expect(write).not.toHaveBeenCalled();
    } finally { for (const write of writes) write.mockRestore(); }
    for (const method of ['llm', 'github', 'embedder'] as const) expect(app.container[method]).not.toHaveBeenCalled();
  });

  it('rejects invalid logical paths and empty/oversized text before any replacement', async () => {
    const before = await pg.handle.db.select().from(t.codeChunks);
    for (const path of ['', '/absolute.md', 'C:/absolute.md', 'a\\b.md', 'a//b.md', './a.md', 'a/../b.md',
      'a/./b.md', 'control\n.md', 'control\0.md', 'x'.repeat(257)]) {
      const res = await app.inject({ method: 'PUT', url: `/repos/${repoId}/context`, payload: { path, content: 'valid' } });
      expect(res.statusCode, path).toBe(422);
    }
    for (const content of ['', '   ', 'é'.repeat(32769)]) {
      const res = await app.inject({ method: 'PUT', url: `/repos/${repoId}/context`, payload: { path: 'valid.md', content } });
      expect(res.statusCode).toBe(422);
    }
    expect(await pg.handle.db.select().from(t.codeChunks)).toEqual(before);
    const maximum = 'é'.repeat(32768);
    const accepted = await app.inject({ method: 'PUT', url: `/repos/${repoId}/context`, payload: { path: 'max.md', content: maximum } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().size).toBe(65536);
  });

  it('replaces duplicate/concurrent same-path specs while preserving code, docs, and foreign rows', async () => {
    const path = 'same.md';
    await pg.handle.db.insert(t.codeChunks).values([
      { workspaceId, repoId, source: 'spec', path, content: 'legacy duplicate one' },
      { workspaceId, repoId, source: 'spec', path, content: 'legacy duplicate two' },
      { workspaceId, repoId, source: 'code', path, content: 'keep code' },
      { workspaceId, repoId, source: 'docs', path, content: 'keep docs' },
      { workspaceId: foreignWorkspaceId, repoId, source: 'spec', path, content: 'keep foreign' },
    ]);
    const listOne = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json();
    const listTwo = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json();
    expect(listTwo).toEqual(listOne);
    expect(listOne.filter((item: { path: string }) => item.path === path)).toHaveLength(1);
    const responses = await Promise.all(['replacement A', 'replacement B'].map((content) => app.inject({
      method: 'PUT', url: `/repos/${repoId}/context`, payload: { path, content },
    })));
    for (const res of responses) expect(res.statusCode).toBe(200);
    const rows = await pg.handle.db.select().from(t.codeChunks).where(and(eq(t.codeChunks.repoId, repoId), eq(t.codeChunks.path, path)));
    const ownSpecs = rows.filter((row) => row.workspaceId === workspaceId && row.source === 'spec');
    expect(ownSpecs).toHaveLength(1);
    expect(['replacement A', 'replacement B']).toContain(ownSpecs[0]!.content);
    expect(rows.filter((row) => row.source !== 'spec').map((row) => row.content).sort()).toEqual(['keep code', 'keep docs']);
    expect(rows.find((row) => row.workspaceId === foreignWorkspaceId)?.content).toBe('keep foreign');
  });

  it('rejects missing/foreign parents without provider access or mutation', async () => {
    const before = await pg.handle.db.select().from(t.codeChunks);
    for (const id of ['00000000-0000-4000-8000-000000000001', foreignRepoId]) {
      for (const method of ['GET', 'PUT'] as const) {
        const res = await app.inject({ method, url: `/repos/${id}/context`,
          ...(method === 'PUT' ? { payload: { path: 'intrusion.md', content: 'no' } } : {}) });
        expect(res.statusCode).toBe(404);
      }
    }
    expect((await app.inject({ method: 'GET', url: '/repos/not-uuid/context' })).statusCode).toBe(422);
    expect(await pg.handle.db.select().from(t.codeChunks)).toEqual(before);
    for (const method of ['llm', 'github', 'embedder'] as const) expect(app.container[method]).not.toHaveBeenCalled();
  });
});
