import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { MultiAgentReviewCollection, type LLMProvider, type StructuredRequest, type Review } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';
import { DIFF, candidate } from './helpers/evals.js';

describe('L07 multi-agent review (required isolated PostgreSQL)', () => {
  let pg: PgFixture, app: FastifyInstance, workspaceId: string, sequence = 0;
  let execute: (req: StructuredRequest<unknown>) => Promise<Review>;
  const output: Review = { verdict: 'comment', summary: 'Deterministic injected fixture', score: 70, findings: [candidate()] };
  const structured = vi.fn(async <T>(req: StructuredRequest<T>) => ({ data: await execute(req as StructuredRequest<unknown>) as T,
    model: req.model, tokensIn: 120, tokensOut: 35, costUsd: null, raw: JSON.stringify(output), attempts: 1 }));
  const forbidden = () => { throw new Error('Live I/O is forbidden in L07 tests'); };
  const provider: LLMProvider = { id: 'anthropic', completeStructured: structured, complete: vi.fn(forbidden), embed: vi.fn(forbidden), listModels: vi.fn(async () => []) };
  const git = new MockGitClient({ diff: DIFF }), diff = vi.spyOn(git, 'diff');
  const callers = vi.fn(async () => []), map = vi.fn(async () => ({ degraded: true, text: '', tokens: 0 })), rank = vi.fn(async () => []);
  beforeAll(async () => {
    if (!(await dockerAvailable())) throw new Error('L07 requires Docker and isolated PostgreSQL; these tests cannot be skipped');
    pg = await startPg(); ({ workspaceId } = await seed(pg.handle.db));
    app = await buildApp({ db: pg.handle.db, config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      overrides: { git, llm: { anthropic: provider }, secrets: { get: async () => undefined } } });
    vi.spyOn(app.container, 'github').mockImplementation(async () => forbidden());
    vi.spyOn(app.container, 'repoIntel', 'get').mockReturnValue({ getCallerSignatures: callers, getRepoMap: map, getFileRank: rank } as unknown as typeof app.container.repoIntel);
  });
  beforeEach(() => { structured.mockClear(); diff.mockClear(); callers.mockClear(); map.mockClear(); rank.mockClear(); execute = async () => output; });
  afterAll(async () => { await app?.close(); await pg?.stop(); });

  async function fixture(count = 3, ws = workspaceId) {
    const label = `multi-${++sequence}`;
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId: ws, owner: 'fixture', name: label, fullName: `fixture/${label}` }).returning();
    const [pr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId: ws, repoId: repo!.id, number: sequence, title: label, author: 'fixture', branch: 'feature', base: 'main', headSha: 'fixture-head' }).returning();
    const agents = await pg.handle.db.insert(t.agents).values(Array.from({ length: count }, (_, i) => ({ workspaceId: ws, name: `${label}-${i}`, model: `${label}-${i}`,
      provider: 'anthropic' as const, systemPrompt: `${label} isolated prompt ${i}`, repoIntel: true, strategy: 'single-pass' as const }))).returning();
    return { repo: repo!, pr: pr!, agents };
  }
  const launch = (pr: string, ids: string[]) => app.inject({ method: 'POST', url: `/pulls/${pr}/review`, payload: { agentIds: ids } });
  async function groups(pr: string) {
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr}/multi-agent` }); expect(res.statusCode).toBe(200);
    return MultiAgentReviewCollection.parse(res.json()).groups;
  }
  async function finish(pr: string) {
    await vi.waitFor(async () => expect((await groups(pr))[0]!.members.every(m => m.status !== 'running')).toBe(true), { timeout: 5000, interval: 25 });
    return (await groups(pr))[0]!;
  }

  it('starts all providers before any finishes, prepares once, and persists isolated membership/reviews/traces', async () => {
    const f = await fixture(), releases = new Map<string, () => void>(), entered: StructuredRequest<unknown>[] = [];
    execute = async req => { entered.push(req); await new Promise<void>(resolve => releases.set(req.model, resolve)); return output; };
    const res = await launch(f.pr.id, f.agents.map(a => a.id)); expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(entered).toHaveLength(3), { timeout: 5000 });
    const before = (await groups(f.pr.id))[0]!;
    releases.forEach(release => release());
    expect(before.id).toBe(res.json().group_id); expect(before.members.map(m => m.status)).toEqual(['running', 'running', 'running']);
    expect(before.members.map(m => m.run_id)).toEqual(res.json().runs.map((r: { run_id: string }) => r.run_id));
    expect(diff).toHaveBeenCalledTimes(1); expect(callers).toHaveBeenCalledTimes(1); expect(map).toHaveBeenCalledTimes(1); expect(rank).toHaveBeenCalledTimes(1);
    expect(new Set(entered.map(r => r.messages.find(m => m.role === 'system')?.content)).size).toBe(3);
    const done = await finish(f.pr.id); expect(done.members.every(m => m.status === 'done' && m.review)).toBe(true);
    expect(done.groups[0]!.takes.every(take => take.conclusion === 'flagged')).toBe(true);
    for (const member of done.members) {
      const trace = await app.inject({ method: 'GET', url: `/runs/${member.run_id}/trace` }); expect(trace.statusCode).toBe(200);
      expect(trace.json()).toMatchObject({ source_diff: DIFF, config: { agent: member.agent_name }, stats: { tokens_in: 120, tokens_out: 35, cost_usd: null } });
    }
    expect(await groups(f.pr.id)).toEqual([done]);
  });

  it('retains successful peers when one provider fails and never calls failure a negative', async () => {
    const f = await fixture(); execute = async req => { if (req.model === f.agents[1]!.model) throw new Error('Injected provider failure'); return output; };
    expect((await launch(f.pr.id, f.agents.map(a => a.id))).statusCode).toBe(200);
    const done = await finish(f.pr.id); expect(done.members.map(m => m.status)).toEqual(['done', 'failed', 'done']);
    expect(done.members[1]!.error).toContain('Injected provider failure'); expect(done.groups[0]!.takes[1]!.conclusion).toBe('unknown');
    expect(done.groups[0]!.conflict).toBe(false); expect(structured).toHaveBeenCalledTimes(3);
  });

  it('isolates cancellation while a provider awaits, preserves peer completion and persists a cancellation trace', async () => {
    const f = await fixture(2), releases: (() => void)[] = [];
    execute = async () => { await new Promise<void>(resolve => releases.push(resolve)); return output; };
    const res = await launch(f.pr.id, f.agents.map(a => a.id)); await vi.waitFor(() => expect(releases).toHaveLength(2));
    const id = res.json().runs[0].run_id;
    expect((await app.inject({ method: 'POST', url: `/runs/${id}/cancel` })).statusCode).toBe(200);
    releases.forEach(release => release());
    const done = await finish(f.pr.id); expect(done.members.map(m => m.status)).toEqual(['cancelled', 'done']); expect(done.members[0]!.review).toBeNull();
    await vi.waitFor(async () => expect((await app.inject({ method: 'GET', url: `/runs/${id}/trace` })).statusCode).toBe(200));
    expect(done.groups[0]!.takes[0]!.conclusion).toBe('unknown');
  });

  it('recovers parent selection after child deletion without selecting unrelated later runs or declaring a negative', async () => {
    const f = await fixture(2); const res = await launch(f.pr.id, f.agents.map(a => a.id)); const done = await finish(f.pr.id);
    expect((await app.inject({ method: 'DELETE', url: `/runs/${done.members[0]!.run_id}` })).statusCode).toBe(200);
    const later = await launch(f.pr.id, [f.agents[0]!.id]); await finish(f.pr.id);
    const saved = (await groups(f.pr.id)).find(g => g.id === res.json().group_id)!;
    expect(saved.members.map(m => m.run_id)).toEqual(done.members.map(m => m.run_id)); expect(saved.members[0]!.status).toBe('deleted');
    expect(saved.members[0]!.run_id).not.toBe(later.json().runs[0].run_id); expect(saved.groups[0]!.takes[0]!.conclusion).toBe('unknown');
  });

  it('rejects disabled and foreign selections before creating any parent or child', async () => {
    const f = await fixture(2), [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `foreign-${sequence}` }).returning(), foreign = await fixture(1, ws!.id);
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, f.agents[1]!.id));
    for (const ids of [[f.agents[0]!.id, f.agents[1]!.id], [f.agents[0]!.id, foreign.agents[0]!.id]]) expect((await launch(f.pr.id, ids)).statusCode).toBe(422);
    expect(await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, f.pr.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, f.pr.id))).toHaveLength(0); expect(structured).not.toHaveBeenCalled();
  });

  it('rolls back all rows if a child insert fails, and rechecks disabled selection inside the transaction', async () => {
    const f = await fixture(2), repo = new ReviewRepository(pg.handle.db);
    await expect(repo.createGroup(workspaceId, '00000000-0000-4000-8000-000000000009', f.agents)).rejects.toThrow();
    expect(await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, f.pr.id))).toHaveLength(0);
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, f.agents[1]!.id));
    await expect(repo.createGroup(workspaceId, f.pr.id, f.agents)).rejects.toThrow('enabled workspace agents');
    expect(await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, f.pr.id))).toHaveLength(0);
  });

  it('protects foreign group, child trace, SSE, cancellation, deletion and finding mutations', async () => {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `foreign-scope-${++sequence}` }).returning();
    const f = await fixture(1, ws!.id), [run] = await pg.handle.db.insert(t.agentRuns).values({ workspaceId: ws!.id, prId: f.pr.id, agentId: f.agents[0]!.id, status: 'running' }).returning();
    await pg.handle.db.insert(t.runTraces).values({ runId: run!.id, trace: { secretFixture: 'do not expose' } });
    const [review] = await pg.handle.db.insert(t.reviews).values({ workspaceId: ws!.id, prId: f.pr.id, agentId: f.agents[0]!.id, runId: run!.id, kind: 'review' }).returning();
    const [finding] = await pg.handle.db.insert(t.findings).values({ reviewId: review!.id, file: 'fixture.ts', startLine: 1, endLine: 1, severity: 'WARNING', category: 'bug', title: 'Foreign', rationale: 'Foreign', confidence: 1 }).returning();
    const paths = [ ['GET', `/pulls/${f.pr.id}/multi-agent`], ['GET', `/pulls/${f.pr.id}/runs`], ['GET', `/pulls/${f.pr.id}/runs/active`],
      ['GET', `/runs/${run!.id}/trace`], ['GET', `/runs/${run!.id}/events`], ['POST', `/runs/${run!.id}/cancel`], ['DELETE', `/runs/${run!.id}`],
      ['POST', `/findings/${finding!.id}/accept`], ['POST', `/findings/${finding!.id}/dismiss`], ['POST', `/findings/${finding!.id}/learn`] ];
    for (const [method, url] of paths) expect((await app.inject({ method: method as 'GET' | 'POST' | 'DELETE', url: url! })).statusCode).toBe(404);
    expect((await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, run!.id)))[0]!.status).toBe('running');
  });

  it('saves explicit Learn once even for simultaneous requests and persists original finding decision actions', async () => {
    const f = await fixture(1); await launch(f.pr.id, [f.agents[0]!.id]); const done = await finish(f.pr.id), id = done.members[0]!.review!.findings[0]!.id;
    const responses = await Promise.all(Array.from({ length: 3 }, () => app.inject({ method: 'POST', url: `/findings/${id}/learn` })));
    expect(responses.map(r => r.statusCode)).toEqual([200, 200, 200]);
    expect(new Set(responses.map(r => r.json().memoryId)).size).toBe(1);
    expect(responses[0]!.json().memoryId).toBeTruthy();
    const memories = await pg.handle.db.select().from(t.memory).where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.repoId, f.repo.id)));
    expect(memories).toHaveLength(1); expect(memories[0]!.sources).toMatchObject({ finding_id: id, source: 'explicit-user-learning' });
    expect((await app.inject({ method: 'POST', url: `/findings/${id}/accept` })).json().finding.accepted_at).toBeTruthy();
    expect((await app.inject({ method: 'POST', url: `/findings/${id}/dismiss` })).json().finding).toMatchObject({ accepted_at: null });
    expect((await groups(f.pr.id))[0]!.members[0]!.review!.findings[0]!.dismissed_at).toBeTruthy(); expect(structured).toHaveBeenCalledTimes(1);
  });

  it('retains originals and snapshot names when a completed agent is deleted', async () => {
    const f = await fixture(1); await launch(f.pr.id, [f.agents[0]!.id]); const before = await finish(f.pr.id);
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, f.agents[0]!.id));
    const after = (await groups(f.pr.id))[0]!;
    expect(after.members[0]).toMatchObject({ status: 'done', agent_id: f.agents[0]!.id, agent_name: f.agents[0]!.name });
    expect(after.members[0]!.review!.findings).toEqual(before.members[0]!.review!.findings);
    expect(after.groups[0]!.takes[0]!.conclusion).toBe('flagged');
  });

  it('cancellation acknowledged after inference but before atomic persistence prevents review and done writes', async () => {
    const f = await fixture(1), original = ReviewRepository.prototype.persistOutcome;
    let entered = false, release: () => void = () => {};
    const spy = vi.spyOn(ReviewRepository.prototype, 'persistOutcome').mockImplementation(async function (...args) {
      entered = true; await new Promise<void>(resolve => { release = resolve; }); return original.apply(this, args);
    });
    try {
      const response = await launch(f.pr.id, [f.agents[0]!.id]); await vi.waitFor(() => expect(entered).toBe(true));
      const run = response.json().runs[0].run_id;
      expect((await app.inject({ method: 'POST', url: `/runs/${run}/cancel` })).statusCode).toBe(200); release();
      await vi.waitFor(async () => expect((await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, run)))[0]!.error).toBe('Cancelled by user'));
      expect((await groups(f.pr.id))[0]!.members[0]!.status).toBe('cancelled');
      expect((await groups(f.pr.id))[0]!.members[0]).toMatchObject({ tokens_in: 120, tokens_out: 35, cost_usd: null });
      expect(await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, run))).toHaveLength(0);
    } finally { release(); spy.mockRestore(); }
  });

  it('shared preparation failure cannot overwrite an acknowledged cancellation', async () => {
    const f = await fixture(2); let reject: (error: Error) => void = () => {};
    diff.mockImplementationOnce(async () => { await new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }); throw new Error('unreachable'); });
    const response = await launch(f.pr.id, f.agents.map(a => a.id)); await vi.waitFor(() => expect(diff).toHaveBeenCalledOnce());
    expect((await app.inject({ method: 'POST', url: `/runs/${response.json().runs[0].run_id}/cancel` })).statusCode).toBe(200);
    reject(new Error('Injected shared diff failure'));
    const saved = await finish(f.pr.id); expect(saved.members.map(m => m.status)).toEqual(['cancelled', 'failed']);
    expect(saved.members[0]!.error).toBe('Cancelled by user'); expect(structured).not.toHaveBeenCalled();
  });

  it('atomic trace failure rolls back original findings and status; guarded failure cannot overwrite a done run', async () => {
    const f = await fixture(1), repo = new ReviewRepository(pg.handle.db), { selected } = await repo.createGroup(workspaceId, f.pr.id, f.agents);
    const review = { workspaceId, prId: f.pr.id, agentId: f.agents[0]!.id, runId: selected[0]!.run_id, kind: 'review' as const, verdict: 'comment', summary: 'Fixture', score: 70, model: 'fixture' };
    const stats = { durationMs: 100, tokensIn: 120, tokensOut: 35, costUsd: null, grounding: '1/1 passed', score: 70, blockers: 0 };
    await expect(repo.persistOutcome(review, [candidate()], stats, 'fixture-head', { invalid: 1n } as unknown as import('@devdigest/shared').RunTrace)).rejects.toThrow();
    expect(await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, review.runId))).toHaveLength(0);
    expect((await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, review.runId)))[0]!.status).toBe('running');
    await pg.handle.db.update(t.agentRuns).set({ status: 'done', tokensIn: 120 }).where(eq(t.agentRuns.id, review.runId));
    await repo.completeAgentRun(review.runId, { status: 'failed', durationMs: 0, tokensIn: 0, tokensOut: 0, costUsd: null, findingsCount: 0, grounding: '0/0 passed', error: 'Late trace error' });
    expect((await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, review.runId)))[0]).toMatchObject({ status: 'done', tokensIn: 120, error: null });
  });

  it('checks malformed own-workspace PR → foreign-workspace repository relationships', async () => {
    const own = await fixture(1), [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `foreign-parent-${sequence}` }).returning(), foreign = await fixture(1, ws!.id);
    await pg.handle.db.update(t.pullRequests).set({ repoId: foreign.repo.id }).where(eq(t.pullRequests.id, own.pr.id));
    const [run] = await pg.handle.db.insert(t.agentRuns).values({ workspaceId, prId: own.pr.id, agentId: own.agents[0]!.id, status: 'running' }).returning();
    for (const url of [`/pulls/${own.pr.id}/multi-agent`, `/pulls/${own.pr.id}/reviews`, `/runs/${run!.id}/trace`, `/runs/${run!.id}/events`])
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    expect((await launch(own.pr.id, [own.agents[0]!.id])).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/runs/${run!.id}/cancel` })).statusCode).toBe(404); expect(structured).not.toHaveBeenCalled();
  });
});
