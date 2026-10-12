import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { FastifyInstance } from 'fastify';

const enabled = await dockerAvailable();
(enabled ? describe : describe.skip)('Smart Diff persisted reads (PostgreSQL)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let prId: string;
  let foreignId: string;
  const inferenceCalls: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    const repo = (await pg.handle.db.select().from(t.repos))[0]!;
    const [pull] = await pg.handle.db.insert(t.pullRequests).values({
      workspaceId, repoId: repo.id, number: 9991, title: 'Smart Diff integration',
      author: 'test', branch: 'feature', base: 'main', headSha: 'abc',
    }).returning();
    prId = pull!.id;
    await pg.handle.db.insert(t.prFiles).values([
      { prId, path: 'src/core.ts', additions: 5, deletions: 2 },
      { prId, path: 'src/core.test.ts', additions: 3, deletions: 0 },
      { prId, path: 'index.ts', additions: 1, deletions: 0 },
      { prId, path: 'README.md', additions: 1, deletions: 0 },
      { prId, path: 'pnpm-lock.yaml', additions: 1, deletions: 0 },
    ]);
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'Foreign' }).returning();
    foreignId = foreign!.id;
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' }),
      db: pg.handle.db, overrides: { secrets: { get: async () => undefined } },
    });
    vi.spyOn(app.container, 'llm').mockImplementation(async () => {
      inferenceCalls.push('llm'); throw new Error('Smart Diff must never infer');
    });
    vi.spyOn(app.container, 'github').mockImplementation(async () => {
      inferenceCalls.push('github'); throw new Error('Smart Diff must never fetch');
    });
    vi.spyOn(app.container, 'git', 'get').mockImplementation(() => {
      inferenceCalls.push('git'); throw new Error('Smart Diff must never clone');
    });
  }, 120_000);
  afterAll(async () => { await app?.close(); await pg?.stop(); });

  async function read() {
    const response = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(response.statusCode).toBe(200);
    const result = SmartDiffResponse.parse(response.json());
    expect(inferenceCalls).toEqual([]);
    return result;
  }
  const addReview = async (kind: 'review' | 'summary', day: number, ws = workspaceId) => {
    const [review] = await pg.handle.db.insert(t.reviews).values({
      workspaceId: ws, prId, kind, createdAt: new Date(`2026-10-${day}T12:00:00Z`),
    }).returning();
    return review!;
  };

  it('groups actual persisted files before a review without inference or remote calls', async () => {
    const result = await read();
    expect(result.groups.map((group) => group.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(result.groups.map((group) => group.files.length)).toEqual([1, 1, 1, 1, 1]);
    expect(result.groups.flatMap((group) => group.files).every((file) => file.finding_lines.length === 0)).toBe(true);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 13, proposed_splits: [] });
  });
  it('uses the latest review, excludes a newer summary and retains actioned findings', async () => {
    const old = await addReview('review', 10);
    const latest = await addReview('review', 11);
    await addReview('summary', 12);
    await pg.handle.db.insert(t.findings).values([
      { reviewId: old.id, file: 'src/core.ts', startLine: 1, endLine: 1, severity: 'WARNING', category: 'bug', title: 'Old', rationale: 'Old', confidence: 1 },
      ...[10, 10, 20].map((line, index) => ({
        reviewId: latest.id, file: 'src/core.ts', startLine: line, endLine: line,
        severity: 'WARNING', category: 'bug', title: `Latest ${index}`, rationale: 'Latest', confidence: 1,
        acceptedAt: index === 0 ? new Date() : null,
        dismissedAt: index === 1 ? new Date() : null,
      })),
    ]);
    expect((await read()).groups[0]!.files[0]!.finding_lines).toEqual([10, 20]);
  });
  it('a latest empty review clears old markers and ignores a foreign-workspace review', async () => {
    await addReview('review', 13);
    const foreign = await addReview('review', 14, foreignId);
    await pg.handle.db.insert(t.findings).values({
      reviewId: foreign.id, file: 'src/core.ts', startLine: 30, endLine: 30,
      severity: 'CRITICAL', category: 'security', title: 'Foreign', rationale: 'Private', confidence: 1,
    });
    expect((await read()).groups[0]!.files[0]!.finding_lines).toEqual([]);
    const feed = await app.inject({ method: 'GET', url: `/pulls/${prId}/reviews` });
    expect(feed.statusCode).toBe(200);
    const rows = feed.json();
    expect(rows.some((row: { id: string }) => row.id === foreign.id)).toBe(false);
    expect(rows[0].findings).toEqual([]);
    expect(rows.flatMap((row: { findings: { title: string }[] }) => row.findings)
      .some((finding: { title: string }) => finding.title === 'Foreign')).toBe(false);
  });
  it('rejects unknown/foreign PRs and invalid IDs before reading data', async () => {
    const repo = (await pg.handle.db.select().from(t.repos))[0]!;
    const [foreignPr] = await pg.handle.db.insert(t.pullRequests).values({
      workspaceId: foreignId, repoId: repo.id, number: 9992, title: 'Private',
      author: 'foreign', branch: 'private', base: 'main', headSha: 'foreign',
    }).returning();
    for (const id of [foreignPr!.id, '00000000-0000-4000-8000-000000000001']) {
      expect((await app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/pulls/invalid/smart-diff' })).statusCode).toBeGreaterThanOrEqual(400);
    expect(inferenceCalls).toEqual([]);
  });
});
