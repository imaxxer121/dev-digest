import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { BriefResponse, type BriefOutput, type LLMProvider, type StructuredRequest } from '@devdigest/shared';
import { createHash } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { BriefService } from '../src/modules/brief/service.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const OUTPUT: BriefOutput = {
  summary: 'Change retry policy to cap queued work while preserving the public API.',
  risks: [
    { kind: 'behavior', title: 'Retry callers', explanation: 'Check the existing retry caller boundary.', severity: 'medium',
      file_refs: ['src/retry.ts', 'src/caller.ts', 'unknown.ts', '../src/retry.ts', 'src/retry.ts'] },
    { kind: 'guessed', title: 'Guessed path', explanation: 'This reference should be discarded.', severity: 'low',
      file_refs: ['specs/policy.md', 'src/declaration-only.ts', 'GET /retry'] },
  ],
  review_focus: [
    { file: 'src/caller.ts', line: 18, reason: 'Follow the indexed caller.' },
    { file: 'unknown.ts', line: 1, reason: 'Discard this guessed file.' },
    { file: 'src/retry.ts', line: 10, reason: 'Inspect the changed retry branch.' },
    { file: 'src/caller.ts', line: 18, reason: 'Follow the indexed caller.' },
  ],
};

const enabled = await dockerAvailable();
(enabled ? describe : describe.skip)('PR brief explicit generation and durable cache (PostgreSQL)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let sequence = 0;
  let modelData: unknown = OUTPUT;
  let attempts = 1;
  let failure: Error | undefined;
  let onCompletion: ((req: StructuredRequest<unknown>) => Promise<void>) | undefined;
  const structured = vi.fn(async <T>(req: StructuredRequest<T>) => {
    if (failure) throw failure;
    await onCompletion?.(req as StructuredRequest<unknown>);
    return { data: modelData as T, model: req.model, tokensIn: 321, tokensOut: 89, costUsd: null,
      raw: JSON.stringify(modelData), attempts };
  });
  const provider: LLMProvider = { id: 'anthropic', completeStructured: structured,
    complete: vi.fn(async () => { throw new Error('Unexpected text completion'); }),
    embed: vi.fn(async () => { throw new Error('Unexpected embedding'); }), listModels: vi.fn(async () => []) };
  const github = new MockGitHubClient();
  const getIssue = vi.spyOn(github, 'getIssue');
  const getBlastRadius = vi.fn(async () => ({
    changedSymbols: [{ name: 'retry', file: 'src/retry.ts', kind: 'function' },
      { name: 'declarationOnly', file: 'src/declaration-only.ts', kind: 'function' }],
    callers: [{ symbol: 'handler', file: 'src/caller.ts', line: 18, viaSymbol: 'retry', viaFile: 'src/retry.ts', rank: 1 }],
    impactedEndpoints: ['GET /retry'], factsByFile: { 'src/caller.ts': { endpoints: ['GET /retry'], crons: [] } },
    indexedSha: 'index-snapshot', degraded: true, reason: 'index_partial' as const,
  }));

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      db: pg.handle.db, overrides: { github, llm: { anthropic: provider }, secrets: { get: async () => undefined },
        repoIntel: { getBlastRadius } as unknown as RepoIntel } });
    for (const property of ['git', 'codeIndex', 'tokenizer'] as const) {
      vi.spyOn(app.container, property, 'get').mockImplementation(() => { throw new Error('Unexpected brief source I/O'); });
    }
    vi.spyOn(app.container, 'embedder').mockImplementation(async () => { throw new Error('Unexpected brief embedding'); });
    vi.spyOn(app.container, 'llm');
    vi.spyOn(app.container, 'github');
    const settings = await app.inject({ method: 'PUT', url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'anthropic', model: 'fixture-selected-model' } } } });
    expect(settings.statusCode).toBe(200);
  });
  beforeEach(() => {
    modelData = OUTPUT; attempts = 1; failure = undefined; onCompletion = undefined;
    structured.mockClear(); getIssue.mockClear(); getBlastRadius.mockClear();
    vi.mocked(app.container.llm).mockClear(); vi.mocked(app.container.github).mockClear();
  });
  afterAll(async () => { await app?.close(); await pg?.stop(); });

  async function fixture(body: string | null = 'Closes #71. Bound retries.') {
    const name = `brief-${++sequence}`;
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId, owner: 'brief', name,
      fullName: `brief/${name}` }).returning();
    const [pr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: repo!.id, number: 71,
      title: 'Bound retries', author: 'fixture', branch: 'feature', base: 'main', headSha: 'head-old', body,
      additions: 2, deletions: 1, filesCount: 1, status: 'open' }).returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/retry.ts', additions: 2, deletions: 1,
      patch: '@@ -8,1 +10,2 @@\n-PATCH_BODY_SENTINEL\n+PATCH_BODY_SENTINEL\n+privateCode()' });
    return { pr: pr!, repo: repo! };
  }
  async function generate(id: string) {
    return app.inject({ method: 'POST', url: `/pulls/${id}/brief`, payload: {} });
  }
  async function cache(id: string) {
    return (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, id)))[0]?.json;
  }

  it('uses the Settings provider once, includes scoped facts/spec bytes, grounds references, and saves no review runs', async () => {
    const { pr, repo } = await fixture();
    const content = 'Saved policy: café 茶 🧭 must retain bounded retries.';
    await pg.handle.db.insert(t.prIntent).values({ prId: pr.id, intent: 'Bound queued work', inScope: ['retries'], outOfScope: ['public API'] });
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-brief' }).returning();
    await pg.handle.db.insert(t.codeChunks).values([
      { workspaceId, repoId: repo.id, source: 'spec', path: 'specs/policy.md', content },
      { workspaceId, repoId: repo.id, source: 'code', path: 'src/hidden.ts', content: 'CODE_CHUNK_SENTINEL' },
      { workspaceId: foreign!.id, repoId: repo.id, source: 'spec', path: 'foreign.md', content: 'FOREIGN_SPEC_SENTINEL' },
    ]);
    const runsBefore = await pg.handle.db.select().from(t.agentRuns);
    const result = await generate(pr.id);
    expect(result.statusCode).toBe(200);
    const envelope = BriefResponse.parse(result.json());
    const brief = envelope.brief!;
    expect(envelope).toMatchObject({ current_head_sha: 'head-old', stale: false });
    expect(brief).toMatchObject({ version: 1, head_sha: 'head-old', intent: { intent: 'Bound queued work' },
      blast: { degraded: true, reason: 'index_partial', indexed_sha: 'index-snapshot' } });
    expect(brief.risks.risks).toHaveLength(1);
    expect(brief.risks.risks[0]!.file_refs).toEqual(['src/retry.ts', 'src/caller.ts']);
    expect(brief.review_focus).toEqual([OUTPUT.review_focus[0], OUTPUT.review_focus[2]]);
    expect(brief.generation).toMatchObject({ provider: 'anthropic', model: 'fixture-selected-model', application_calls: 1,
      attempts: 1, adapter_framing_allowance_bytes: 1024, input_budget_bytes: 32000, budget_unit: 'utf8_bytes',
      tokens_in: 321, tokens_out: 89, cost_usd: null });
    expect(brief.generation.budgeted_input_bytes).toBe(brief.generation.measured_payload_bytes + 1024);
    expect(brief.generation.budgeted_input_bytes).toBeLessThanOrEqual(32000);
    expect(brief.generation.discarded_refs).toBeGreaterThan(0);
    expect(brief.generation.discarded_risks).toBe(1);
    expect(brief.generation.discarded_focus).toBeGreaterThan(0);
    expect(brief.provenance).toMatchObject({ intent_sha_coverage: 'unknown', indexed_sha: 'index-snapshot',
      specs: { status: 'available', total_count: 1, included_count: 1 } });
    expect(brief.provenance.specs_included).toEqual([{ path: 'specs/policy.md',
      digest: createHash('sha256').update(content).digest('hex'), original_bytes: Buffer.byteLength(content), included_bytes: Buffer.byteLength(content) }]);
    expect(app.container.llm).toHaveBeenCalledTimes(1);
    expect(app.container.llm).toHaveBeenCalledWith('anthropic');
    expect(structured).toHaveBeenCalledTimes(1);
    const request = structured.mock.calls[0]![0];
    expect(request).toMatchObject({ model: 'fixture-selected-model', maxRetries: 0 });
    expect(request.schema.safeParse({ ...OUTPUT, extra: true }).success).toBe(false);
    const prompt = JSON.stringify(request.messages);
    expect(prompt).toContain(content);
    for (const sentinel of ['PATCH_BODY_SENTINEL', 'privateCode()', 'CODE_CHUNK_SENTINEL', 'FOREIGN_SPEC_SENTINEL', '"patch"']) expect(prompt).not.toContain(sentinel);
    expect(getIssue).toHaveBeenCalledTimes(1);
    expect(getIssue).toHaveBeenCalledWith({ owner: repo.owner, name: repo.name }, 71);
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith(repo.id, ['src/retry.ts']);
    expect(await cache(pr.id)).toEqual(brief);
    expect(await pg.handle.db.select().from(t.agentRuns)).toEqual(runsBefore);
    expect(provider.complete).not.toHaveBeenCalled(); expect(provider.embed).not.toHaveBeenCalled();
  });

  it('GET cache/empty/legacy/stale reads never call facts/providers or write', async () => {
    const { pr } = await fixture(null);
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json()).toEqual({ brief: null, current_head_sha: 'head-old', stale: false });
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { intent: 'legacy unvalidated' } });
    const invalid = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(invalid.statusCode).toBe(200);
    expect(BriefResponse.parse(invalid.json()).brief).toBeNull();
    expect(structured).not.toHaveBeenCalled();
    const generated = await generate(pr.id);
    expect(generated.statusCode).toBe(200);
    const saved = BriefResponse.parse(generated.json()).brief;
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'head-new' }).where(eq(t.pullRequests.id, pr.id));
    structured.mockClear(); getBlastRadius.mockClear(); getIssue.mockClear();
    vi.mocked(app.container.llm).mockClear(); vi.mocked(app.container.github).mockClear();
    const writes = ['insert', 'update', 'delete'].map((method) => vi.spyOn(pg.handle.db, method as 'insert'));
    try {
      for (let i = 0; i < 2; i++) {
        const read = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
        expect(read.statusCode).toBe(200);
        expect(BriefResponse.parse(read.json())).toEqual({ brief: saved, current_head_sha: 'head-new', stale: true });
      }
      for (const write of writes) expect(write).not.toHaveBeenCalled();
    } finally { for (const write of writes) write.mockRestore(); }
    expect(await cache(pr.id)).toEqual(saved);
    expect(structured).not.toHaveBeenCalled(); expect(app.container.llm).not.toHaveBeenCalled();
    expect(app.container.github).not.toHaveBeenCalled(); expect(getIssue).not.toHaveBeenCalled(); expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('reports absent Intent/description/specs and unavailable facts without a fallback completion', async () => {
    const { pr } = await fixture(null);
    getBlastRadius.mockRejectedValueOnce(new Error('Index unavailable'));
    modelData = { summary: 'Review the changed retry policy.', risks: [], review_focus: [] };
    const result = await generate(pr.id);
    expect(result.statusCode).toBe(200);
    const brief = BriefResponse.parse(result.json()).brief!;
    expect(brief.intent).toBeNull(); expect(brief.blast).toBeNull();
    expect(brief.provenance).toMatchObject({ description: { status: 'missing' }, intent: { status: 'missing' },
      blast: { status: 'unavailable' }, linked_issue: { status: 'missing' }, specs: { status: 'missing' } });
    expect(structured).toHaveBeenCalledTimes(1); expect(getIssue).not.toHaveBeenCalled();
  });

  it('a linked-issue lookup failure is disclosed while preserving a single structured completion', async () => {
    const { pr } = await fixture();
    getIssue.mockRejectedValueOnce(new Error('Offline issue fixture'));
    const result = await generate(pr.id);
    expect(result.statusCode).toBe(200);
    expect(BriefResponse.parse(result.json()).brief!.provenance.linked_issue).toMatchObject({ status: 'unavailable', included_count: 0 });
    expect(getIssue).toHaveBeenCalledTimes(1);
    expect(structured).toHaveBeenCalledTimes(1);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('provider/schema/reprompt failures keep the previous cache and do not retry', async () => {
    const { pr } = await fixture();
    expect((await generate(pr.id)).statusCode).toBe(200);
    const saved = await cache(pr.id);
    for (const variant of ['provider', 'schema', 'attempts'] as const) {
      modelData = variant === 'schema' ? { summary: 'Malformed missing arrays' } : OUTPUT;
      attempts = variant === 'attempts' ? 2 : 1;
      failure = variant === 'provider' ? new Error('Provider fixture failure') : undefined;
      structured.mockClear();
      const failed = await generate(pr.id);
      expect(failed.statusCode, variant).toBeGreaterThanOrEqual(400);
      expect(failed.json().error.code).toBeTruthy();
      expect(structured).toHaveBeenCalledTimes(1);
      expect(await cache(pr.id)).toEqual(saved);
    }
    modelData = OUTPUT; attempts = 1; failure = undefined;
    expect((await generate(pr.id)).statusCode).toBe(200);
  });

  it('a cache transaction failure preserves the old document', async () => {
    const { pr } = await fixture();
    expect((await generate(pr.id)).statusCode).toBe(200);
    const saved = await cache(pr.id);
    await pg.handle.sql.unsafe("CREATE FUNCTION l05_reject_brief() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture cache write failure'; END $$");
    await pg.handle.sql.unsafe('CREATE TRIGGER l05_reject_brief BEFORE INSERT OR UPDATE ON pr_brief FOR EACH ROW EXECUTE FUNCTION l05_reject_brief()');
    try {
      structured.mockClear();
      const failed = await generate(pr.id);
      expect(failed.statusCode).toBeGreaterThanOrEqual(400);
      expect(structured).toHaveBeenCalledTimes(1);
      expect(await cache(pr.id)).toEqual(saved);
    } finally {
      await pg.handle.sql.unsafe('DROP TRIGGER l05_reject_brief ON pr_brief');
      await pg.handle.sql.unsafe('DROP FUNCTION l05_reject_brief()');
    }
  });

  it('a durable head move during inference returns 409 and preserves the previous cache', async () => {
    const { pr } = await fixture();
    expect((await generate(pr.id)).statusCode).toBe(200);
    const saved = await cache(pr.id);
    structured.mockClear();
    onCompletion = async () => { await pg.handle.db.update(t.pullRequests).set({ headSha: 'head-raced' }).where(eq(t.pullRequests.id, pr.id)); };
    const raced = await generate(pr.id);
    expect(raced.statusCode).toBe(409);
    expect(raced.json().error.code).toBe('brief_head_changed');
    expect(structured).toHaveBeenCalledTimes(1);
    expect(await cache(pr.id)).toEqual(saved);
    expect(BriefResponse.parse((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json()).stale).toBe(true);
  });

  it('a concurrent POST is rejected before another completion and the guard releases after success', async () => {
    const { pr } = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    onCompletion = async () => { entered(); await blocked; };
    const first = generate(pr.id);
    await started;
    try {
      const competing = await generate(pr.id);
      expect(competing.statusCode).toBe(409);
      expect(competing.json().error.code).toBe('brief_generation_in_progress');
      expect(structured).toHaveBeenCalledTimes(1);
      await expect(new BriefService(app.container).generate(workspaceId, pr.id)).rejects.toMatchObject({
        code: 'brief_generation_in_progress', statusCode: 409,
      });
      expect(structured).toHaveBeenCalledTimes(1);
    } finally { release(); }
    expect((await first).statusCode).toBe(200);
    onCompletion = undefined;
    expect((await generate(pr.id)).statusCode).toBe(200);
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it('missing, foreign, and malformed parent PRs return 404 before facts/provider access or cache writes', async () => {
    const { repo } = await fixture();
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-brief-scope' }).returning();
    const [foreignRepo] = await pg.handle.db.insert(t.repos).values({ workspaceId: foreign!.id,
      owner: 'foreign', name: 'brief', fullName: 'foreign/brief' }).returning();
    const [foreignPr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId: foreign!.id, repoId: repo.id, number: 72,
      title: 'Foreign', author: 'test', branch: 'f', base: 'm', headSha: 'foreign', body: 'Closes #1' }).returning();
    const [mismatchPr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: foreignRepo!.id, number: 73,
      title: 'Mismatched', author: 'test', branch: 'f', base: 'm', headSha: 'foreign', body: 'Closes #1' }).returning();
    await pg.handle.db.insert(t.prBrief).values([{ prId: foreignPr!.id, json: { sentinel: 'foreign cache' } },
      { prId: mismatchPr!.id, json: { sentinel: 'mismatched cache' } }]);
    const before = await pg.handle.db.select().from(t.prBrief);
    for (const id of ['00000000-0000-4000-8000-000000000001', foreignPr!.id, mismatchPr!.id]) {
      expect((await app.inject({ method: 'GET', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
      expect((await generate(id)).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/pulls/not-uuid/brief' })).statusCode).toBe(422);
    expect(await pg.handle.db.select().from(t.prBrief)).toEqual(before);
    expect(app.container.llm).not.toHaveBeenCalled(); expect(app.container.github).not.toHaveBeenCalled();
    expect(structured).not.toHaveBeenCalled(); expect(getBlastRadius).not.toHaveBeenCalled(); expect(getIssue).not.toHaveBeenCalled();
  });
});
