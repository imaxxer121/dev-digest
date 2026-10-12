import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { BriefResponse, PrDetail, type PrMeta } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const enabled = await dockerAvailable();
(enabled ? describe : describe.skip)('Durable PR head/detail refresh (PostgreSQL)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let sequence = 0;
  const apps: FastifyInstance[] = [];
  beforeAll(async () => { pg = await startPg(); ({ workspaceId } = await seed(pg.handle.db)); });
  afterAll(async () => { for (const app of apps) await app.close(); await pg?.stop(); });

  async function fixture() {
    const name = `detail-${++sequence}`;
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId, owner: 'detail', name, fullName: `detail/${name}` }).returning();
    const [pr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: repo!.id, number: 70,
      title: 'Refresh retry policy', author: 'fixture', branch: 'feature', base: 'main', headSha: 'old-head',
      body: 'OLD_DETAIL_BODY_SENTINEL', additions: 4, deletions: 2, filesCount: 1, status: 'open' }).returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/old.ts', additions: 4, deletions: 2,
      patch: '@@ -10,2 +10,4 @@\n-OLD_PATCH_SENTINEL\n+oldCode()' });
    await pg.handle.db.insert(t.prCommits).values({ prId: pr!.id, sha: 'old-head', message: 'Old commit', author: 'fixture' });
    return { pr: pr!, repo: repo! };
  }
  function meta(head: string): PrMeta {
    return { number: 70, title: 'Refresh retry policy', author: 'fixture', branch: 'feature', base: 'main',
      head_sha: head, additions: 0, deletions: 0, files_count: 0, status: 'open' };
  }
  async function appFor(github: MockGitHubClient) {
    const llm = new MockLLMProvider('openai', { structured: { summary: 'Cap retry work.', risks: [{ kind: 'behavior', title: 'Old path',
      explanation: 'Discard this path after head changes.', severity: 'low', file_refs: ['src/old.ts'] }],
      review_focus: [{ file: 'src/old.ts', line: 10, reason: 'Inspect old branch.' }] } });
    const getBlastRadius = vi.fn(async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [],
      indexedSha: 'index-snapshot', degraded: false }));
    const app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      db: pg.handle.db, overrides: { github, llm: { openai: llm }, secrets: { get: async () => undefined },
        repoIntel: { getBlastRadius } as unknown as RepoIntel } });
    apps.push(app);
    const resolveLlm = vi.spyOn(app.container, 'llm');
    return { app, llm, resolveLlm, getBlastRadius };
  }
  async function durable(id: string) {
    return { pull: (await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, id)))[0],
      files: await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, id)),
      commits: await pg.handle.db.select().from(t.prCommits).where(eq(t.prCommits.prId, id)) };
  }

  it('a successful live detail refresh persists the returned head, files, body, stats, and commits together', async () => {
    const { pr } = await fixture();
    const detail = { ...meta('new-head'), body: 'Current durable description', additions: 7, deletions: 3, files_count: 2,
      files: [{ path: 'src/new.ts', additions: 6, deletions: 2, patch: '@@ -4,2 +4,6 @@\n+newCode()' },
        { path: 'README.md', additions: 1, deletions: 1, patch: null }],
      commits: [{ sha: 'new-head', message: 'Current commit', author: 'fixture', committed_at: '2026-10-01T12:00:00Z' }] };
    const github = new MockGitHubClient({ detail });
    const { app, resolveLlm } = await appFor(github);
    const response = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(response.statusCode).toBe(200);
    expect(PrDetail.parse(response.json())).toMatchObject({ id: pr.id, head_sha: 'new-head', body: detail.body, files: detail.files, commits: detail.commits });
    const persisted = await durable(pr.id);
    expect(persisted.pull).toMatchObject({ headSha: 'new-head', body: detail.body, additions: 7, deletions: 3, filesCount: 2 });
    expect(persisted.files.map(({ path, additions, deletions, patch }) => ({ path, additions, deletions, patch }))).toEqual(detail.files);
    expect(persisted.commits).toHaveLength(1);
    expect(persisted.commits[0]).toMatchObject({ sha: 'new-head', message: 'Current commit', author: 'fixture', committedAt: new Date('2026-10-01T12:00:00Z') });
    expect(resolveLlm).not.toHaveBeenCalled();
  });

  it('failure after replacing files rolls back every old fact and serves the persisted detail offline', async () => {
    const { pr } = await fixture();
    const before = await durable(pr.id);
    const github = new MockGitHubClient({ detail: { ...meta('failed-head'), body: 'Should roll back', additions: 8, deletions: 0, files_count: 1,
      files: [{ path: 'src/failed.ts', additions: 8, deletions: 0, patch: '+failed' }],
      commits: [{ sha: 'failed-head', message: 'ROLLBACK_COMMIT_SENTINEL', author: 'fixture', committed_at: null }] } });
    const { app, resolveLlm } = await appFor(github);
    await pg.handle.sql.unsafe("CREATE FUNCTION l05_reject_detail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.message = 'ROLLBACK_COMMIT_SENTINEL' THEN RAISE EXCEPTION 'fixture commit replacement failure'; END IF; RETURN NEW; END $$");
    await pg.handle.sql.unsafe('CREATE TRIGGER l05_reject_detail_commit BEFORE INSERT ON pr_commits FOR EACH ROW EXECUTE FUNCTION l05_reject_detail_commit()');
    try {
      const fallback = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
      expect(fallback.statusCode).toBe(200);
      expect(PrDetail.parse(fallback.json())).toMatchObject({ head_sha: 'old-head', body: 'OLD_DETAIL_BODY_SENTINEL',
        additions: 4, deletions: 2, files_count: 1, files: [{ path: 'src/old.ts' }], commits: [{ sha: 'old-head' }] });
      expect(await durable(pr.id)).toEqual(before);
    } finally {
      await pg.handle.sql.unsafe('DROP TRIGGER l05_reject_detail_commit ON pr_commits');
      await pg.handle.sql.unsafe('DROP FUNCTION l05_reject_detail_commit()');
    }
    vi.spyOn(app.container, 'github').mockRejectedValue(new Error('Offline fixture'));
    const offline = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(offline.statusCode).toBe(200);
    expect(offline.json().head_sha).toBe('old-head');
    expect(await durable(pr.id)).toEqual(before);
    expect(resolveLlm).not.toHaveBeenCalled();
  });

  it('offline detail waits for a locked writer and returns one coherent committed head/files/commits snapshot', async () => {
    const { pr } = await fixture();
    const { app, resolveLlm } = await appFor(new MockGitHubClient());
    vi.spyOn(app.container, 'github').mockRejectedValue(new Error('Offline fixture'));
    let announceLocked!: () => void;
    let releaseWriter!: () => void;
    const locked = new Promise<void>((resolve) => { announceLocked = resolve; });
    const released = new Promise<void>((resolve) => { releaseWriter = resolve; });
    const writer = pg.handle.db.transaction(async (tx) => {
      await tx.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id)).for('update');
      await tx.update(t.pullRequests).set({ headSha: 'atomic-head', body: 'Atomic description', additions: 9, deletions: 3, filesCount: 1 })
        .where(eq(t.pullRequests.id, pr.id));
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      await tx.insert(t.prFiles).values({ prId: pr.id, path: 'src/atomic.ts', additions: 9, deletions: 3, patch: '@@ -1,3 +1,9 @@' });
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      await tx.insert(t.prCommits).values({ prId: pr.id, sha: 'atomic-head', message: 'Atomic commit', author: 'fixture' });
      announceLocked();
      await released;
    });
    await locked;
    let completed = false;
    const response = app.inject({ method: 'GET', url: `/pulls/${pr.id}` }).then((result) => { completed = true; return result; });
    try {
      // Observe the real database wait instead of using a timing-only concurrency assertion.
      await expect.poll(async () => {
        const [state] = await pg.handle.sql<{ waiting: number }[]>`
          select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
            and query like '%pull_requests%' and pid <> pg_backend_pid()
        `;
        return state!.waiting;
      }, { timeout: 5000, interval: 20 }).toBeGreaterThan(0);
      expect(completed).toBe(false);
    } finally { releaseWriter(); await writer; }
    const result = await response;
    expect(result.statusCode).toBe(200);
    expect(PrDetail.parse(result.json())).toMatchObject({ head_sha: 'atomic-head', body: 'Atomic description',
      additions: 9, deletions: 3, files_count: 1,
      files: [{ path: 'src/atomic.ts', additions: 9, deletions: 3 }],
      commits: [{ sha: 'atomic-head', message: 'Atomic commit' }] });
    expect(resolveLlm).not.toHaveBeenCalled();
  });

  it('an older GitHub detail response cannot overwrite a head imported while its fetch was pending', async () => {
    const { pr, repo } = await fixture();
    const github = new MockGitHubClient({ pulls: [meta('newer-imported-head')] });
    let announceFetch!: () => void;
    let releaseFetch!: () => void;
    const started = new Promise<void>((resolve) => { announceFetch = resolve; });
    const released = new Promise<void>((resolve) => { releaseFetch = resolve; });
    const getDetail = vi.spyOn(github, 'getPullRequest').mockImplementationOnce(async () => {
      announceFetch();
      await released;
      return { ...meta('old-head'), body: 'STALE_FETCH_BODY_SENTINEL', additions: 99, deletions: 1, files_count: 1,
        files: [{ path: 'src/stale-fetch.ts', additions: 99, deletions: 1, patch: '+staleCode()' }],
        commits: [{ sha: 'old-head', message: 'Stale fetch commit', author: 'fixture', committed_at: null }] };
    });
    const { app, resolveLlm } = await appFor(github);
    const pending = app.inject({ method: 'GET', url: `/pulls/${pr.id}` }).then((result) => result);
    await started;
    try {
      const poll = await app.inject({ method: 'POST', url: `/repos/${repo.id}/poll` });
      expect(poll.statusCode).toBe(200);
      expect((await durable(pr.id)).pull!.headSha).toBe('newer-imported-head');
    } finally { releaseFetch(); }
    const response = await pending;
    expect(response.statusCode).toBe(200);
    expect(PrDetail.parse(response.json())).toMatchObject({ head_sha: 'newer-imported-head', body: null,
      additions: 0, deletions: 0, files_count: 0, files: [], commits: [] });
    const current = await durable(pr.id);
    expect(current.pull).toMatchObject({ headSha: 'newer-imported-head', body: null, additions: 0, deletions: 0, filesCount: 0 });
    expect(current.files).toEqual([]); expect(current.commits).toEqual([]);
    expect(getDetail).toHaveBeenCalledTimes(1); expect(resolveLlm).not.toHaveBeenCalled();
  });

  it('a pending list statistics backfill cannot restore counts from a head superseded by polling', async () => {
    const { pr, repo } = await fixture();
    await pg.handle.db.update(t.pullRequests).set({ additions: 0, deletions: 0, filesCount: 0 }).where(eq(t.pullRequests.id, pr.id));
    const github = new MockGitHubClient({ pulls: [] });
    vi.spyOn(github, 'listPullRequests').mockResolvedValueOnce([meta('old-head')]).mockResolvedValueOnce([meta('new-stats-head')]);
    let announceFetch!: () => void;
    let releaseFetch!: () => void;
    const started = new Promise<void>((resolve) => { announceFetch = resolve; });
    const released = new Promise<void>((resolve) => { releaseFetch = resolve; });
    vi.spyOn(github, 'getPullRequest').mockImplementationOnce(async () => {
      announceFetch(); await released;
      return { ...meta('old-head'), body: 'Old statistics description', additions: 88, deletions: 22, files_count: 3,
        files: [], commits: [] };
    });
    const { app, resolveLlm } = await appFor(github);
    const pending = app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` }).then((result) => result);
    await started;
    try {
      const poll = await app.inject({ method: 'POST', url: `/repos/${repo.id}/poll` });
      expect(poll.statusCode).toBe(200);
      expect((await durable(pr.id)).pull!.headSha).toBe('new-stats-head');
    } finally { releaseFetch(); }
    const response = await pending;
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({ additions: 0, deletions: 0, files_count: 0 });
    const current = await durable(pr.id);
    expect(current.pull).toMatchObject({ headSha: 'new-stats-head', body: null, additions: 0, deletions: 0, filesCount: 0 });
    expect(current.files).toEqual([]); expect(current.commits).toEqual([]);
    expect(resolveLlm).not.toHaveBeenCalled();
  });

  it.each(['list', 'poll'] as const)('%s head advance clears old facts, marks the old brief stale, and never generates until POST', async (mode) => {
    const { pr, repo } = await fixture();
    const github = new MockGitHubClient({ pulls: [meta('advanced-head')] });
    // List backfill may try a detail fetch; its failure must leave head-only imports coherent.
    vi.spyOn(github, 'getPullRequest').mockRejectedValue(new Error('No detail available for imported head'));
    const { app, llm, resolveLlm, getBlastRadius } = await appFor(github);
    const generated = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, payload: {} });
    expect(generated.statusCode).toBe(200);
    const oldBrief = BriefResponse.parse(generated.json()).brief;
    llm.calls.length = 0; resolveLlm.mockClear(); getBlastRadius.mockClear();
    const refresh = await app.inject(mode === 'list' ? { method: 'GET', url: `/repos/${repo.id}/pulls` }
      : { method: 'POST', url: `/repos/${repo.id}/poll` });
    expect(refresh.statusCode).toBe(200);
    const persisted = await durable(pr.id);
    expect(persisted.pull).toMatchObject({ headSha: 'advanced-head', body: null, additions: 0, deletions: 0, filesCount: 0 });
    expect(persisted.files).toEqual([]); expect(persisted.commits).toEqual([]);
    const cache = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(BriefResponse.parse(cache.json())).toEqual({ brief: oldBrief, current_head_sha: 'advanced-head', stale: true });
    expect(llm.calls).toEqual([]); expect(resolveLlm).not.toHaveBeenCalled(); expect(getBlastRadius).not.toHaveBeenCalled();
    const explicit = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, payload: {} });
    expect(explicit.statusCode).toBe(200);
    const newBrief = BriefResponse.parse(explicit.json()).brief!;
    expect(newBrief.head_sha).toBe('advanced-head');
    expect(newBrief.risks.risks).toEqual([]); expect(newBrief.review_focus).toEqual([]);
    expect(newBrief.provenance.files.status).toBe('missing');
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.method).toBe('completeStructured');
    const request = llm.calls[0]!.req as { messages: unknown };
    const prompt = JSON.stringify(request.messages);
    for (const old of ['src/old.ts', 'OLD_DETAIL_BODY_SENTINEL', 'OLD_PATCH_SENTINEL']) expect(prompt).not.toContain(old);
  });

  it.each(['list', 'poll'] as const)('%s same-head metadata sync retains stored files, commits, body, and statistics', async (mode) => {
    const { pr, repo } = await fixture();
    const before = await durable(pr.id);
    const github = new MockGitHubClient({ pulls: [{ ...meta('old-head'), title: 'Updated title at same head' }] });
    const { app, resolveLlm } = await appFor(github);
    const refresh = await app.inject(mode === 'list' ? { method: 'GET', url: `/repos/${repo.id}/pulls` }
      : { method: 'POST', url: `/repos/${repo.id}/poll` });
    expect(refresh.statusCode).toBe(200);
    const after = await durable(pr.id);
    expect(after.pull).toMatchObject({ title: 'Updated title at same head', headSha: 'old-head',
      body: before.pull!.body, additions: 4, deletions: 2, filesCount: 1 });
    expect(after.files).toEqual(before.files); expect(after.commits).toEqual(before.commits);
    expect(resolveLlm).not.toHaveBeenCalled();
  });

  it('foreign PRs and a same-workspace PR under a foreign parent return 404 before GitHub or writes', async () => {
    const { pr, repo } = await fixture();
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-detail' }).returning();
    const [foreignRepo] = await pg.handle.db.insert(t.repos).values({ workspaceId: foreign!.id,
      owner: 'foreign', name: 'detail', fullName: 'foreign/detail' }).returning();
    const [foreignPr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId: foreign!.id, repoId: repo.id, number: 71,
      title: 'Foreign', author: 'fixture', branch: 'f', base: 'm', headSha: 'foreign' }).returning();
    const [mismatch] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: foreignRepo!.id, number: 71,
      title: 'Mismatch', author: 'fixture', branch: 'f', base: 'm', headSha: 'foreign' }).returning();
    const github = new MockGitHubClient({ pulls: [] });
    const getDetail = vi.spyOn(github, 'getPullRequest');
    const { app, resolveLlm } = await appFor(github);
    const before = await durable(mismatch!.id);
    for (const id of ['00000000-0000-4000-8000-000000000001', foreignPr!.id, mismatch!.id]) {
      expect((await app.inject({ method: 'GET', url: `/pulls/${id}` })).statusCode).toBe(404);
      await expect(new PullsRepository(pg.handle.db).readDetail(workspaceId, id)).rejects.toMatchObject({ statusCode: 404 });
    }
    const foreignBefore = await durable(foreignPr!.id);
    const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((row: { id: string }) => row.id)).toEqual([pr.id]);
    expect(list.payload).not.toContain(foreignPr!.id);
    expect(await durable(foreignPr!.id)).toEqual(foreignBefore);
    expect(await durable(mismatch!.id)).toEqual(before);
    expect(getDetail).not.toHaveBeenCalled(); expect(resolveLlm).not.toHaveBeenCalled();
  });
});
