import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { LLMProvider, StructuredRequest } from '@devdigest/shared';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { AppError } from '../src/platform/errors.js';
import * as t from '../src/db/schema.js';
import { IntentResponse } from '../src/vendor/shared/contracts/review-api.js';
import { IntentService } from '../src/modules/intent/service.js';
import intentRoutes from '../src/modules/intent/routes.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const OUTPUT = { intent: 'Bound retry work', in_scope: ['retry policy'], out_of_scope: ['UI'] };
describe('Intent scoped persistence and result races (required isolated PostgreSQL)', () => {
  let pg: PgFixture, app: FastifyInstance, container: Container, service: IntentService, workspaceId: string;
  let complete: ((request: StructuredRequest<unknown>) => Promise<void>) | undefined;
  let output: unknown = OUTPUT;
  const structured = vi.fn(async <T>(req: StructuredRequest<T>) => {
    await complete?.(req as StructuredRequest<unknown>);
    return { data: output as T, model: req.model, tokensIn: 71, tokensOut: 19, costUsd: null, attempts: 1, raw: JSON.stringify(output) };
  });
  const forbidden = () => { throw new Error('Intent must not read source or call another provider operation'); };
  const provider: LLMProvider = { id: 'anthropic', completeStructured: structured,
    complete: vi.fn(forbidden), embed: vi.fn(forbidden), listModels: vi.fn(forbidden) };
  beforeAll(async () => {
    if (!(await dockerAvailable())) throw new Error('Intent requires real isolated PostgreSQL; Docker unavailable is not a skipped pass');
    pg = await startPg();
    // T1 can run before T4's one combined migration. Only this disposable fixture is advanced;
    // after migration integration, all columns already exist and these statements are no-ops.
    await pg.handle.db.execute(sql`ALTER TABLE pr_intent
      ADD COLUMN IF NOT EXISTS generation_id uuid, ADD COLUMN IF NOT EXISTS head_sha text,
      ADD COLUMN IF NOT EXISTS generated_at timestamptz, ADD COLUMN IF NOT EXISTS provider text,
      ADD COLUMN IF NOT EXISTS model text, ADD COLUMN IF NOT EXISTS tokens_in integer,
      ADD COLUMN IF NOT EXISTS tokens_out integer, ADD COLUMN IF NOT EXISTS cost_usd double precision`);
    const [workspace] = await pg.handle.db.insert(t.workspaces).values({ name: 'intent-fixture' }).returning();
    workspaceId = workspace!.id;
    await pg.handle.db.insert(t.settings).values({ workspaceId, key: 'feature_models',
      value: { review_intent: { provider: 'anthropic', model: 'intent-settings-model' } } });
    container = new Container(loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }), pg.handle.db,
      { llm: { anthropic: provider }, auth: { currentWorkspace: async () => ({ id: workspaceId, name: 'fixture' }),
        currentUser: async () => ({ id: randomUUID(), name: 'fixture', email: 'fixture@example.test' }) }, secrets: { get: async () => undefined } });
    for (const property of ['git', 'codeIndex', 'repoIntel', 'tokenizer'] as const) vi.spyOn(container, property, 'get').mockImplementation(forbidden);
    vi.spyOn(container, 'github').mockImplementation(async () => forbidden());
    vi.spyOn(container, 'embedder').mockImplementation(async () => forbidden());
    vi.spyOn(container, 'llm');
    service = new IntentService(container);
    app = Fastify(); app.decorate('container', container);
    app.setValidatorCompiler(validatorCompiler); app.setSerializerCompiler(serializerCompiler);
    app.setErrorHandler((error, _request, reply) => { reply.status(error instanceof AppError ? error.statusCode : 500)
      .send({ error: { code: error instanceof AppError ? error.code : 'internal_error', message: error.message } }); });
    await app.register(intentRoutes);
  });
  beforeEach(() => { complete = undefined; output = OUTPUT; structured.mockClear(); vi.mocked(container.llm).mockClear(); });
  afterAll(async () => { await app?.close(); await pg?.stop(); });
  async function fixture(prWorkspace = workspaceId, parentWorkspace = workspaceId) {
    const name = randomUUID();
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId: parentWorkspace, owner: 'intent', name, fullName: `intent/${name}` }).returning();
    const [pull] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId: prWorkspace, repoId: repo!.id, number: 1,
      title: 'Retry policy', body: 'Bound retries; UI unchanged.', author: 'fixture', branch: 'f', base: 'main', headSha: 'head0' }).returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: pull!.id, path: 'src/retry.ts', additions: 2, deletions: 1,
      patch: '@@ -10,1 +10,2 @@\n-SOURCE_SECRET\n+PATCH_BODY_SECRET\n+password = SECRET' });
    return pull!;
  }
  const cache = async (id: string) => (await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, id)))[0];
  const post = (id: string) => app.inject({ method: 'POST', url: `/pulls/${id}/intent/recalculate` });

  it('explicit POST persists selected feature model and actual usage from source-free metadata; GET/reload adds zero inference', async () => {
    const pull = await fixture();
    expect(IntentResponse.parse((await app.inject({ url: `/pulls/${pull.id}/intent` })).json())).toMatchObject({ intent: null, freshness: 'missing' });
    expect(structured).not.toHaveBeenCalled();
    const response = await post(pull.id);
    expect(response.statusCode).toBe(200);
    const saved = IntentResponse.parse(response.json());
    expect(saved).toMatchObject({ freshness: 'current', intent: { ...OUTPUT, pr_id: pull.id, head_sha: 'head0', provider: 'anthropic',
      model: 'intent-settings-model', tokens_in: 71, tokens_out: 19, cost_usd: null } });
    expect(container.llm).toHaveBeenCalledWith('anthropic');
    const request = structured.mock.calls[0]![0];
    expect(request).toMatchObject({ model: 'intent-settings-model', maxRetries: 0, schemaName: 'Intent' });
    const wire = JSON.stringify(request.messages);
    for (const text of ['SOURCE_SECRET', 'PATCH_BODY_SECRET', 'password = SECRET', '"patch"', '@@']) expect(wire).not.toContain(text);
    expect(wire).toContain('src/retry.ts');
    expect(wire).toContain('available metadata');
    const row = await cache(pull.id);
    expect(row).toMatchObject({ generationId: saved.intent!.generation_id, headSha: 'head0', intent: OUTPUT.intent });
    for (let i = 0; i < 2; i++) expect(IntentResponse.parse((await app.inject({ url: `/pulls/${pull.id}/intent` })).json())).toEqual(saved);
    expect(structured).toHaveBeenCalledTimes(1);
    expect(provider.complete).not.toHaveBeenCalled(); expect(provider.embed).not.toHaveBeenCalled();
    expect(await pg.handle.db.select().from(t.agentRuns)).toHaveLength(0);
  });
  it('legacy provenance is unknown, then a changed head is stale without overwriting the successful value', async () => {
    const pull = await fixture();
    await pg.handle.db.insert(t.prIntent).values({ prId: pull.id, intent: OUTPUT.intent, inScope: OUTPUT.in_scope, outOfScope: OUTPUT.out_of_scope });
    expect(await service.read(workspaceId, pull.id)).toMatchObject({ freshness: 'unknown', intent: { head_sha: null, model: null, tokens_in: null } });
    await service.recalculate(workspaceId, pull.id);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'head1' }).where(eq(t.pullRequests.id, pull.id));
    expect(await service.read(workspaceId, pull.id)).toMatchObject({ freshness: 'stale', intent: { head_sha: 'head0' } });
  });
  it('missing files and blank description persist an explicitly limited purpose with no invented scope', async () => {
    const pull = await fixture();
    await pg.handle.db.delete(t.prFiles).where(eq(t.prFiles.prId, pull.id));
    await pg.handle.db.update(t.pullRequests).set({ body: '' }).where(eq(t.pullRequests.id, pull.id));
    const response = await service.recalculate(workspaceId, pull.id);
    expect(response.intent).toMatchObject({ intent: expect.stringContaining('no PR description and no changed-file information'), in_scope: [], out_of_scope: [] });
    expect(structured.mock.calls[0]![0].messages[1]!.content).toContain('"files":[]');
  });
  it('foreign PRs, malformed parent bindings and missing identities reject before provider access or mutation', async () => {
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign' }).returning();
    const foreignPull = await fixture(foreign!.id, foreign!.id);
    const malformed = await fixture(workspaceId, foreign!.id);
    for (const id of [foreignPull.id, malformed.id, randomUUID()]) {
      expect((await post(id)).statusCode).toBe(404);
      expect((await app.inject({ url: `/pulls/${id}/intent` })).statusCode).toBe(404);
      expect(await cache(id)).toBeUndefined();
    }
    expect(container.llm).not.toHaveBeenCalled(); expect(structured).not.toHaveBeenCalled();
  });
  it('provider/validation failures retain prior success and batch failure carries no stale scope', async () => {
    const pull = await fixture(); await service.recalculate(workspaceId, pull.id); const before = await cache(pull.id);
    complete = async () => { throw new Error('provider failed'); };
    expect((await post(pull.id)).statusCode).toBe(502); expect(await cache(pull.id)).toEqual(before);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'moved' }).where(eq(t.pullRequests.id, pull.id));
    expect(await service.prepareForBatch(workspaceId, pull.id)).toMatchObject({ status: 'degraded', intent: undefined, record: null });
    expect(await cache(pull.id)).toEqual(before);
    complete = undefined; output = { intent: 'missing lists' };
    expect((await post(pull.id)).statusCode).toBe(502); expect(await cache(pull.id)).toEqual(before);
  });
  it('a late result cannot replace previous success after the scoped head moves', async () => {
    const pull = await fixture(); await service.recalculate(workspaceId, pull.id); const before = await cache(pull.id);
    let finish!: () => void;
    complete = async () => new Promise<void>(resolve => { finish = resolve; });
    const request = post(pull.id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'new-head' }).where(eq(t.pullRequests.id, pull.id));
    finish();
    const response = await request;
    expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe('intent_head_changed');
    expect(await cache(pull.id)).toEqual(before);
  });
  it('two captured generations race atomically and the later completion cannot overwrite the winning result', async () => {
    const pull = await fixture(); await service.recalculate(workspaceId, pull.id);
    const finish: (() => void)[] = [];
    complete = async () => new Promise<void>(resolve => { finish.push(resolve); });
    const older = post(pull.id);
    await vi.waitFor(() => expect(finish).toHaveLength(1));
    const newer = post(pull.id);
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[1]!(); expect((await newer).statusCode).toBe(200); const winner = await cache(pull.id);
    finish[0]!(); const late = await older;
    expect(late.statusCode).toBe(409); expect(late.json().error.code).toBe('intent_result_changed');
    expect(await cache(pull.id)).toEqual(winner);
  });
  it('one batch preparation is cached and separate agents receive cloneable plain Intent values', async () => {
    const pull = await fixture();
    const prepared = await service.prepareForBatch(workspaceId, pull.id);
    expect(prepared.status).toBe('classified');
    const a = structuredClone(prepared.intent), b = structuredClone(prepared.intent);
    a!.in_scope.push('Only agent A'); expect(b!.in_scope).not.toContain('Only agent A');
    expect((await service.prepareForBatch(workspaceId, pull.id)).status).toBe('cached');
    expect(structured).toHaveBeenCalledTimes(1);
  });
});
