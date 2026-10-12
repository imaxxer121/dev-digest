import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const enabled = await dockerAvailable();
(enabled ? describe : describe.skip)('Blast Radius route (PostgreSQL)', () => {
  let pg: PgFixture; let app: FastifyInstance; let prId: string; let repoId: string; let workspaceId: string;
  const getBlastRadius = vi.fn(async () => ({ changedSymbols: [{ name: 'helper', file: 'lib.ts', kind: 'function' }],
    callers: [{ symbol: 'handler', file: 'routes.ts', line: 8, viaSymbol: 'helper', viaFile: 'lib.ts', rank: 1 }],
    impactedEndpoints: ['GET /real'], factsByFile: { 'routes.ts': { endpoints: ['GET /real'], crons: [] } },
    degraded: false, indexedSha: 'cached-snapshot' }));
  beforeAll(async () => {
    pg = await startPg(); await seed(pg.handle.db);
    const repo = (await pg.handle.db.select().from(t.repos))[0]!;
    repoId = repo.id; workspaceId = repo.workspaceId;
    const [pull] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId, number: 9910,
      title: 'Blast test', author: 'test', branch: 'feature', base: 'main', headSha: 'head' }).returning();
    prId = pull!.id;
    await pg.handle.db.insert(t.prFiles).values({ prId, path: 'lib.ts', additions: 1, deletions: 1 });
    app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test' }), db: pg.handle.db,
      overrides: { secrets: { get: async () => undefined }, repoIntel: { getBlastRadius } as unknown as RepoIntel } });
    for (const method of ['llm', 'github'] as const) vi.spyOn(app.container, method).mockImplementation(async () => { throw new Error('Forbidden hot-path I/O'); });
  });
  afterAll(async () => { await app?.close(); await pg?.stop(); });
  it('scopes persisted PR files then invokes facade exactly once and validates the document', async () => {
    getBlastRadius.mockClear();
    const response = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(response.statusCode).toBe(200);
    const blast = BlastRadius.parse(response.json());
    expect(blast.counts).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 0 });
    expect(blast.indexed_sha).toBe('cached-snapshot');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith(repoId, ['lib.ts']);
  });
  it('unknown, invalid, foreign PR and mismatched parent workspace never reach facade', async () => {
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'Foreign' }).returning();
    const [foreignPr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId: foreign!.id, repoId, number: 9911,
      title: 'Foreign', author: 'test', branch: 'f', base: 'm', headSha: 'x' }).returning();
    const [foreignRepo] = await pg.handle.db.insert(t.repos).values({ workspaceId: foreign!.id, owner: 'private', name: 'repo', fullName: 'private/repo', defaultBranch: 'main' }).returning();
    const [mismatchPr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: foreignRepo!.id, number: 9912,
      title: 'Mismatched', author: 'test', branch: 'f', base: 'm', headSha: 'x' }).returning();
    getBlastRadius.mockClear();
    for (const id of ['00000000-0000-4000-8000-000000000001', foreignPr!.id, mismatchPr!.id]) {
      expect((await app.inject({ method: 'GET', url: `/pulls/${id}/blast` })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/pulls/not-uuid/blast' })).statusCode).toBe(422);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });
});
