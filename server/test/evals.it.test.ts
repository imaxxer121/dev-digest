import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { EvalBatchDetail, EvalBatchStarted, EvalCaseCollection, EvalCaseConversion, type LLMProvider, type StructuredRequest } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { EvalsRepository } from '../src/modules/evals/repository.js';
import { scoreGroup } from '../src/modules/evals/scorer.js';
import { summarize } from '../src/modules/evals/snapshot.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';
import { DIFF, FILE, candidate } from './helpers/evals.js';

// This required suite fails, rather than silently skipping, if Docker is absent.
describe('L06 immutable eval pipeline (required PostgreSQL integration)', () => {
  let pg: PgFixture, app: FastifyInstance, workspaceId: string;
  let sequence = 0, output: unknown, attempts = 1;
  let onCompletion: ((req: StructuredRequest<unknown>) => Promise<void>) | undefined;
  const structured = vi.fn(async <T>(req: StructuredRequest<T>) => {
    await onCompletion?.(req as StructuredRequest<unknown>);
    return { data: output as T, model: req.model, tokensIn: 120, tokensOut: 34, costUsd: null, raw: JSON.stringify(output), attempts };
  });
  const forbidden = () => { throw new Error('Eval attempted live source I/O'); };
  const provider: LLMProvider = { id: 'anthropic', completeStructured: structured, complete: vi.fn(forbidden), embed: vi.fn(forbidden), listModels: vi.fn(async () => []) };
  const options = () => ({ config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }), db: pg.handle.db,
    overrides: { llm: { anthropic: provider }, secrets: { get: async () => undefined } } });
  beforeAll(async () => {
    if (!(await dockerAvailable())) throw new Error('L06 requires a reachable Docker daemon and PostgreSQL; integration cannot be skipped');
    pg = await startPg(); ({ workspaceId } = await seed(pg.handle.db)); app = await buildApp(options());
    for (const property of ['git', 'codeIndex', 'repoIntel', 'tokenizer'] as const) vi.spyOn(app.container, property, 'get').mockImplementation(forbidden);
    vi.spyOn(app.container, 'github').mockImplementation(async () => forbidden());
    vi.spyOn(app.container, 'embedder').mockImplementation(async () => forbidden());
  });
  beforeEach(() => {
    output = { verdict: 'comment', summary: 'Fixture', score: 70, findings: [candidate(), candidate(), candidate(100)] };
    attempts = 1; onCompletion = undefined; structured.mockClear();
  });
  afterAll(async () => { await app?.close(); await pg?.stop(); });

  async function fixture(decision: 'accepted' | 'dismissed' | 'pending' = 'accepted', diff = DIFF) {
    const label = `eval-${++sequence}`;
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId, owner: 'eval', name: label, fullName: `eval/${label}` }).returning();
    const [pr] = await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: repo!.id, number: sequence,
      title: 'CURRENT_TITLE_SENTINEL', author: 'fixture', branch: 'f', base: 'main', headSha: 'current-head', body: 'CURRENT_BODY_SENTINEL' }).returning();
    const [agent] = await pg.handle.db.insert(t.agents).values({ workspaceId, name: label, provider: 'anthropic', model: 'fixture-model',
      systemPrompt: 'SYSTEM_SNAPSHOT', strategy: 'map-reduce', repoIntel: true, outputSchema: { configured: true } }).returning();
    const [run] = await pg.handle.db.insert(t.agentRuns).values({ workspaceId, agentId: agent!.id, prId: pr!.id, status: 'done' }).returning();
    const [review] = await pg.handle.db.insert(t.reviews).values({ workspaceId, agentId: agent!.id, prId: pr!.id, runId: run!.id, kind: 'review' }).returning();
    const [finding] = await pg.handle.db.insert(t.findings).values({ reviewId: review!.id, file: FILE, startLine: 11, endLine: 11,
      severity: 'WARNING', category: 'bug', title: 'LABEL_SENTINEL', rationale: 'EXPECTATION_SENTINEL', confidence: 1,
      acceptedAt: decision === 'accepted' ? new Date() : null, dismissedAt: decision === 'dismissed' ? new Date() : null }).returning();
    await pg.handle.db.insert(t.runTraces).values({ runId: run!.id, trace: { prompt_assembly: { user: `Task\n\n## Diff to review\n<untrusted source="diff">\n${diff}\n</untrusted>`, pr_description: 'SAVED_DESCRIPTION' } } });
    return { repo: repo!, pr: pr!, agent: agent!, run: run!, review: review!, finding: finding! };
  }
  const convert = (id: string, notes?: string) => app.inject({ method: 'POST', url: `/findings/${id}/eval-case`, payload: notes === undefined ? {} : { notes } });
  const start = (id: string) => app.inject({ method: 'POST', url: `/agents/${id}/eval-runs`, payload: {} });
  async function detail(id: string) {
    const res = await app.inject({ method: 'GET', url: `/eval-runs/${id}` }); expect(res.statusCode).toBe(200); return EvalBatchDetail.parse(res.json());
  }
  async function finished(id: string) {
    await vi.waitFor(async () => expect((await detail(id)).status).not.toBe('running'), { timeout: 5000, interval: 20 });
    return detail(id);
  }
  async function addTarget(f: Awaited<ReturnType<typeof fixture>>, line: number, negative = false) {
    const [finding] = await pg.handle.db.insert(t.findings).values({ reviewId: f.review.id, file: FILE, startLine: line, endLine: line,
      severity: 'WARNING', category: 'bug', title: 'SECOND_LABEL_SENTINEL', rationale: 'Another target', confidence: 1,
      acceptedAt: negative ? null : new Date(), dismissedAt: negative ? new Date() : null }).returning();
    const res = await convert(finding!.id, 'NOTES_SENTINEL'); expect(res.statusCode).toBe(201); return EvalCaseConversion.parse(res.json()).case;
  }

  it('accepts truly empty action POSTs without payload/content-type for conversion and Run all', async () => {
    const f = await fixture();
    const created = await app.inject({ method: 'POST', url: `/findings/${f.finding.id}/eval-case` });
    expect(created.statusCode).toBe(201); const saved = EvalCaseConversion.parse(created.json()).case; expect(saved.notes).toBeNull();
    const existing = await app.inject({ method: 'POST', url: `/findings/${f.finding.id}/eval-case` });
    expect(existing.statusCode).toBe(200); expect(existing.json()).toEqual({ case: saved, created: false });
    const launched = await app.inject({ method: 'POST', url: `/agents/${f.agent.id}/eval-runs` });
    expect(launched.statusCode).toBe(202); const batch = await finished(EvalBatchStarted.parse(launched.json()).batch_id);
    expect(batch.status).toBe('completed'); expect(structured).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], 1, 'invalid', { notes: 7 }, { unexpected: true }])('keeps explicitly malformed action bodies invalid: %j', async payload => {
    const f = await fixture(); const options = { method: 'POST' as const, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) };
    expect((await app.inject({ ...options, url: `/findings/${f.finding.id}/eval-case` })).statusCode).toBe(422);
    expect((await app.inject({ ...options, url: `/agents/${f.agent.id}/eval-runs` })).statusCode).toBe(422);
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.finding.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.evalBatches).where(eq(t.evalBatches.agentId, f.agent.id))).toHaveLength(0); expect(structured).not.toHaveBeenCalled();
  });

  it('freezes historical exact bytes/provenance, exclusive decision and first notes; survives review deletion and refresh', async () => {
    const f = await fixture();
    const created = await convert(f.finding.id, 'NOTES_SENTINEL'); expect(created.statusCode).toBe(201);
    const saved = EvalCaseConversion.parse(created.json()).case;
    expect(saved).toMatchObject({ owner_id: f.agent.id, input_diff: DIFF, notes: 'NOTES_SENTINEL', expected_output: { kind: 'must_find' },
      input_meta: { pr_title: null, pr_description: 'SAVED_DESCRIPTION', source: { source_head_sha: null, retrieval: 'trace-diff-block', finding_id: f.finding.id } } });
    await pg.handle.db.update(t.findings).set({ acceptedAt: null, dismissedAt: new Date() }).where(eq(t.findings.id, f.finding.id));
    await pg.handle.db.update(t.runTraces).set({ trace: { broken: true } }).where(eq(t.runTraces.runId, f.run.id));
    await pg.handle.db.insert(t.prFiles).values({ prId: f.pr.id, path: FILE, patch: 'LIVE_PATCH_SENTINEL', additions: 1, deletions: 0 });
    const again = await convert(f.finding.id, 'REPLACEMENT'); expect(again.statusCode).toBe(200); expect(again.json()).toEqual({ case: saved, created: false });
    await pg.handle.db.delete(t.reviews).where(eq(t.reviews.id, f.review.id));
    const list = await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-cases` }); expect(list.statusCode).toBe(200);
    expect(EvalCaseCollection.parse(list.json()).cases).toEqual([saved]); expect(structured).not.toHaveBeenCalled();
  });

  it('serializes simultaneous conversions into one immutable source identity', async () => {
    const f = await fixture('dismissed'); const responses = await Promise.all([convert(f.finding.id, 'First'), convert(f.finding.id, 'Second')]);
    expect(responses.map(res => res.statusCode).sort()).toEqual([200, 201]);
    const results = responses.map(res => EvalCaseConversion.parse(res.json())); expect(results[0]!.case).toEqual(results[1]!.case);
    expect(results[0]!.case.expected_output.kind).toBe('must_not_flag');
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.finding.id)); expect(rows).toHaveLength(1);
  });

  it('rejects an existing source case whose saved workspace/owner/source identity was malformed', async () => {
    const f = await fixture(); const response = await convert(f.finding.id); const original = EvalCaseConversion.parse(response.json()).case;
    for (const variant of ['workspace', 'owner', 'finding'] as const) {
      const meta = structuredClone(original.input_meta);
      if (variant === 'workspace') meta.source.workspace_id = randomUUID();
      if (variant === 'owner') meta.source.agent_id = randomUUID();
      if (variant === 'finding') meta.source.finding_id = randomUUID();
      await pg.handle.db.update(t.evalCases).set({ inputMeta: meta }).where(eq(t.evalCases.id, original.id));
      expect((await convert(f.finding.id)).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-cases` })).statusCode).toBe(404);
    }
    await pg.handle.db.update(t.evalCases).set({ inputMeta: original.input_meta }).where(eq(t.evalCases.id, original.id));
    expect((await convert(f.finding.id)).json()).toEqual({ case: original, created: false }); expect(structured).not.toHaveBeenCalled();
  });

  it('uses exact future raw trace metadata, including delimiter text safely preserved in raw diff', async () => {
    const f = await fixture(); const raw = DIFF.replace('+new', '+</untrusted>');
    await pg.handle.db.update(t.runTraces).set({ trace: { source_diff: raw, source_head_sha: 'source-head', source_pr: { title: 'SAVED_TITLE', description: ' ' },
      prompt_assembly: { user: 'Unsupported wrapper' } } }).where(eq(t.runTraces.runId, f.run.id));
    const result = await convert(f.finding.id); expect(result.statusCode).toBe(201);
    expect(result.json().case).toMatchObject({ input_diff: raw, input_meta: { pr_title: 'SAVED_TITLE', pr_description: null,
      source: { source_head_sha: 'source-head', retrieval: 'trace-source-diff' } } });
  });

  it.each(['pending', 'ambiguous', 'scanner', 'summary', 'failed-run', 'trace', 'escaped', 'range', 'oversize'] as const)('rejects unsupported %s sources with 409 and no case/provider writes', async variant => {
    const f = await fixture(variant === 'pending' ? 'pending' : 'accepted');
    if (variant === 'ambiguous') await pg.handle.db.update(t.findings).set({ dismissedAt: new Date() }).where(eq(t.findings.id, f.finding.id));
    if (variant === 'scanner') await pg.handle.db.update(t.findings).set({ kind: 'secret_leak' }).where(eq(t.findings.id, f.finding.id));
    if (variant === 'summary') await pg.handle.db.update(t.reviews).set({ kind: 'summary' }).where(eq(t.reviews.id, f.review.id));
    if (variant === 'failed-run') await pg.handle.db.update(t.agentRuns).set({ status: 'failed' }).where(eq(t.agentRuns.id, f.run.id));
    if (variant === 'trace') await pg.handle.db.delete(t.runTraces).where(eq(t.runTraces.runId, f.run.id));
    if (variant === 'escaped' || variant === 'oversize') await pg.handle.db.update(t.runTraces).set({ trace: { prompt_assembly: { user: `Task\n\n## Diff to review\n<untrusted source="diff">\n${DIFF.replace('+new', variant === 'escaped' ? '+<\\/untrusted>' : `+${'茶'.repeat(22_000)}`)}\n</untrusted>` } } }).where(eq(t.runTraces.runId, f.run.id));
    if (variant === 'range') await pg.handle.db.update(t.findings).set({ startLine: 100, endLine: 100 }).where(eq(t.findings.id, f.finding.id));
    const response = await convert(f.finding.id); expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('eval_source_unsupported');
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.finding.id))).toHaveLength(0); expect(structured).not.toHaveBeenCalled();
  });

  it.each(['review', 'pr', 'repo', 'run', 'agent', 'run-pr', 'run-agent'] as const)('rejects foreign/malformed %s source relationship before writes or inference', async variant => {
    const f = await fixture(); const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: `foreign-${sequence}` }).returning();
    if (variant === 'review') await pg.handle.db.update(t.reviews).set({ workspaceId: foreign!.id }).where(eq(t.reviews.id, f.review.id));
    if (variant === 'pr') await pg.handle.db.update(t.pullRequests).set({ workspaceId: foreign!.id }).where(eq(t.pullRequests.id, f.pr.id));
    if (variant === 'repo') await pg.handle.db.update(t.repos).set({ workspaceId: foreign!.id }).where(eq(t.repos.id, f.repo.id));
    if (variant === 'run') await pg.handle.db.update(t.agentRuns).set({ workspaceId: foreign!.id }).where(eq(t.agentRuns.id, f.run.id));
    if (variant === 'agent') await pg.handle.db.update(t.agents).set({ workspaceId: foreign!.id }).where(eq(t.agents.id, f.agent.id));
    if (variant === 'run-pr') await pg.handle.db.update(t.agentRuns).set({ prId: null }).where(eq(t.agentRuns.id, f.run.id));
    if (variant === 'run-agent') await pg.handle.db.update(t.agentRuns).set({ agentId: null }).where(eq(t.agentRuns.id, f.run.id));
    expect((await convert(f.finding.id)).statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.finding.id))).toHaveLength(0); expect(structured).not.toHaveBeenCalled();
  });

  it('exposes legacy unsupported cases, rejects zero/unsupported/conflicting suites before batch creation', async () => {
    const f = await fixture(); expect((await start(f.agent.id)).statusCode).toBe(409);
    const [legacy] = await pg.handle.db.insert(t.evalCases).values({ workspaceId, ownerKind: 'agent', ownerId: f.agent.id, name: 'Legacy', inputDiff: DIFF, expectedOutput: {} }).returning();
    expect((await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-cases` })).json()).toMatchObject({ cases: [], unsupported: [{ id: legacy!.id, name: 'Legacy' }] });
    expect((await start(f.agent.id)).statusCode).toBe(409); await pg.handle.db.delete(t.evalCases).where(eq(t.evalCases.id, legacy!.id));
    expect((await convert(f.finding.id)).statusCode).toBe(201); await addTarget(f, 11, true);
    const conflict = await start(f.agent.id); expect(conflict.statusCode).toBe(409); expect(conflict.json().error.code).toBe('eval_suite_contradictory');
    expect(await pg.handle.db.select().from(t.evalBatches).where(eq(t.evalBatches.agentId, f.agent.id))).toHaveLength(0); expect(structured).not.toHaveBeenCalled();
  });

  it('rejects foreign skills and current parent repositories with no batch/provider work', async () => {
    const f = await fixture(); expect((await convert(f.finding.id)).statusCode).toBe(201);
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-skill' }).returning();
    const [skill] = await pg.handle.db.insert(t.skills).values({ workspaceId: foreign!.id, name: 'Foreign', description: '', type: 'custom', source: 'manual', body: 'FOREIGN_SKILL' }).returning();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: f.agent.id, skillId: skill!.id });
    expect((await start(f.agent.id)).statusCode).toBe(404); await pg.handle.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, f.agent.id));
    await pg.handle.db.update(t.repos).set({ workspaceId: foreign!.id }).where(eq(t.repos.id, f.repo.id));
    expect((await start(f.agent.id)).statusCode).toBe(404); expect((await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-cases` })).statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.evalBatches).where(eq(t.evalBatches.agentId, f.agent.id))).toHaveLength(0); expect(structured).not.toHaveBeenCalled();
  });

  it('groups shared inputs once, preserves all raw candidates and stores member rows atomically with null known cost', async () => {
    const f = await fixture(); const saved = EvalCaseConversion.parse((await convert(f.finding.id, 'NOTES_SENTINEL')).json()).case; await addTarget(f, 12);
    const [skill] = await pg.handle.db.insert(t.skills).values({ workspaceId, name: 'Enabled', description: '', type: 'custom', source: 'manual', body: 'SKILL_SNAPSHOT' }).returning();
    const [disabled] = await pg.handle.db.insert(t.skills).values({ workspaceId, name: 'Disabled', description: '', type: 'custom', source: 'manual', body: 'DISABLED_SENTINEL', enabled: false }).returning();
    await pg.handle.db.insert(t.agentSkills).values([{ agentId: f.agent.id, skillId: skill!.id, order: 2 }, { agentId: f.agent.id, skillId: disabled!.id, order: 1 }]);
    const launched = await start(f.agent.id); expect(launched.statusCode).toBe(202); const { batch_id } = EvalBatchStarted.parse(launched.json());
    const batch = await finished(batch_id); expect(structured).toHaveBeenCalledTimes(1);
    expect(batch).toMatchObject({ status: 'completed', groups_total: 1, cases_total: 2, groups_succeeded: 1,
      counts: { expected_positives: 2, true_positives: 1, false_negatives: 1, raw_candidates: 3, grounded_candidates: 2, false_positives: 2 },
      metrics: { recall: 0.5, precision: 1 / 3, citation_accuracy: 2 / 3 }, cost_usd: null });
    expect(batch.groups[0]!).toMatchObject({ candidates: [candidate(), candidate(), candidate(100)], rejected: [{ candidate_index: 2 }], structured_calls: 1, structured_attempts: 1, tokens_in: 120 });
    expect(batch.snapshot.agent).toMatchObject({ strategy: 'map-reduce', output_schema: { configured: true }, repo_intel: true });
    expect(batch.snapshot.skills.map(item => item.enabled)).toEqual([false, true]);
    const request = structured.mock.calls[0]![0]; expect(request).toMatchObject({ model: 'fixture-model', maxRetries: 0, timeoutMs: 600000, schemaName: 'Review' });
    const messages = JSON.stringify(request.messages);
    for (const hidden of ['LABEL_SENTINEL', 'NOTES_SENTINEL', 'EXPECTATION_SENTINEL', 'must_find', 'DISABLED_SENTINEL', 'CURRENT_TITLE_SENTINEL', 'CURRENT_BODY_SENTINEL', saved.input_meta.source.finding_id]) expect(messages).not.toContain(hidden);
    expect(messages).toContain('SYSTEM_SNAPSHOT'); expect(messages).toContain('SKILL_SNAPSHOT'); expect(messages).toContain('SAVED_DESCRIPTION');
    const members = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batch_id)); expect(members).toHaveLength(2);
    expect(members.map(row => row.precision)).toEqual([1 / 3, 1 / 3]); expect(members.every(row => row.inputDigest === batch.groups[0]!.input_digest)).toBe(true);
  });

  it('durably snapshots prompt/skill/cases before async work; same-agent competing start returns409; later edits never affect inference', async () => {
    const f = await fixture(); expect((await convert(f.finding.id)).statusCode).toBe(201);
    const [skill] = await pg.handle.db.insert(t.skills).values({ workspaceId, name: 'Skill', description: '', type: 'custom', source: 'manual', body: 'SKILL_SNAPSHOT' }).returning();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: f.agent.id, skillId: skill!.id });
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), block = new Promise<void>(resolve => { release = resolve; });
    onCompletion = async () => { entered(); await block; };
    const launched = await start(f.agent.id); expect(launched.statusCode).toBe(202); const { batch_id } = EvalBatchStarted.parse(launched.json()); await ready;
    const running = await detail(batch_id); expect(running.status).toBe('running'); expect(running.snapshot.agent.system_prompt).toBe('SYSTEM_SNAPSHOT');
    try {
      expect((await start(f.agent.id)).statusCode).toBe(409); expect(structured).toHaveBeenCalledTimes(1);
      await pg.handle.db.update(t.agents).set({ systemPrompt: 'CHANGED_PROMPT', version: 2, model: 'changed-model' }).where(eq(t.agents.id, f.agent.id));
      await pg.handle.db.update(t.skills).set({ body: 'CHANGED_SKILL', version: 2 }).where(eq(t.skills.id, skill!.id));
      await pg.handle.db.update(t.pullRequests).set({ body: 'CHANGED_BODY', headSha: 'changed-head' }).where(eq(t.pullRequests.id, f.pr.id));
      await pg.handle.db.update(t.findings).set({ acceptedAt: null, dismissedAt: new Date() }).where(eq(t.findings.id, f.finding.id));
      const caseId = running.snapshot.cases[0]!.id; await pg.handle.db.update(t.evalCases).set({ notes: 'CHANGED_NOTES' }).where(eq(t.evalCases.id, caseId));
    } finally { release(); }
    const complete = await finished(batch_id); expect(complete.snapshot).toEqual(running.snapshot); expect(complete.groups[0]!.prompt_assembly!.system).toContain('SYSTEM_SNAPSHOT');
    expect(JSON.stringify(complete.groups[0]!.prompt_assembly)).toContain('SKILL_SNAPSHOT');
    onCompletion = undefined; const next = await start(f.agent.id); expect(next.statusCode).toBe(202);
    const second = await finished(next.json().batch_id); expect(second.config_digest).not.toBe(complete.config_digest); expect(second.comparison_key).toBe(complete.comparison_key);
  });

  it('uses actual REPEATABLE READ and database running guard for simultaneous starts before provider I/O', async () => {
    const f = await fixture(); expect((await convert(f.finding.id)).statusCode).toBe(201);
    const repository = new EvalsRepository(pg.handle.db), transaction = vi.spyOn(pg.handle.db, 'transaction');
    try {
      const results = await Promise.allSettled([repository.start(workspaceId, f.agent.id), repository.start(workspaceId, f.agent.id)]);
      expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find(item => item.status === 'rejected'); expect(failure).toMatchObject({ reason: { statusCode: 409 } });
      expect(transaction.mock.calls.every(call => call[1]?.isolationLevel === 'repeatable read')).toBe(true);
      const winner = results.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<EvalBatchDetail>;
      expect(await pg.handle.db.select().from(t.evalBatches).where(and(eq(t.evalBatches.agentId, f.agent.id), eq(t.evalBatches.status, 'running')))).toHaveLength(1);
      await repository.interrupt(workspaceId, winner.value.id, 'Fixture stopped before inference');
    } finally { transaction.mockRestore(); }
    expect(structured).not.toHaveBeenCalled();
  });

  it('continues distinct groups after provider failure, exposes partial/null aggregate ratios and never fabricates passes', async () => {
    const f = await fixture(); await convert(f.finding.id);
    const another = await fixture('accepted', DIFF.replaceAll('+new', '+other'));
    await pg.handle.db.update(t.reviews).set({ agentId: f.agent.id }).where(eq(t.reviews.id, another.review.id));
    await pg.handle.db.update(t.agentRuns).set({ agentId: f.agent.id }).where(eq(t.agentRuns.id, another.run.id)); await convert(another.finding.id);
    onCompletion = async () => { if (structured.mock.calls.length === 1) throw new Error('Fixture provider unavailable'); };
    const launched = await start(f.agent.id); expect(launched.statusCode).toBe(202); const batch = await finished(launched.json().batch_id);
    expect(structured).toHaveBeenCalledTimes(2); expect(batch).toMatchObject({ status: 'partial', groups_succeeded: 1, groups_failed: 1,
      metrics: { recall: null, precision: null, citation_accuracy: null }, cost_usd: null });
    const failure = batch.groups.find(group => group.status === 'failed')!; expect(failure.error).toContain('provider unavailable');
    expect(failure.case_results).toMatchObject([{ pass: null }]); expect(failure.counts).toBeNull(); expect(failure.raw_output).toBeNull();
    expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batch.id))).toHaveLength(2);
  });

  it.each(['schema', 'attempts'] as const)('persists explicit %s failure after exactly one structured call, retaining any known usage/output', async variant => {
    const f = await fixture(); await convert(f.finding.id); if (variant === 'schema') output = { invalid: true }; else attempts = 2;
    const res = await start(f.agent.id); expect(res.statusCode).toBe(202); const batch = await finished(res.json().batch_id);
    expect(structured).toHaveBeenCalledTimes(1); expect(batch.status).toBe('failed'); expect(batch.groups[0]).toMatchObject({ status: 'failed', tokens_in: 120, raw_output: JSON.stringify(output), case_results: [{ pass: null }] });
    expect(batch.metrics).toEqual({ recall: null, precision: null, citation_accuracy: null });
    if (variant === 'attempts') expect(batch.groups[0]!.candidates).toHaveLength(3);
  });

  it('stored GET/history/dashboard reloads never infer or write; scopes batches and validates malformed snapshot tenancy', async () => {
    const f = await fixture(); await convert(f.finding.id); const launched = await start(f.agent.id); const batch = await finished(launched.json().batch_id); structured.mockClear();
    const writes = ['insert', 'update', 'delete'].map(method => vi.spyOn(pg.handle.db, method as 'insert'));
    try {
      expect(await detail(batch.id)).toEqual(batch); expect(await detail(batch.id)).toEqual(batch);
      const history = await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-runs` }); expect(history.statusCode).toBe(200); expect(history.json()[0].id).toBe(batch.id);
      const dashboard = await app.inject({ method: 'GET', url: '/eval-dashboard' }); expect(dashboard.statusCode).toBe(200); expect(dashboard.json().latest.some((item: { id: string }) => item.id === batch.id)).toBe(true);
      writes.forEach(write => expect(write).not.toHaveBeenCalled());
    } finally { writes.forEach(write => write.mockRestore()); }
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'batch-foreign' }).returning();
    await pg.handle.db.update(t.evalBatches).set({ workspaceId: foreign!.id }).where(eq(t.evalBatches.id, batch.id));
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${batch.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-runs` })).json()).toEqual([]);
    const corrupted = structuredClone(batch.snapshot); corrupted.cases[0]!.input_meta.source.workspace_id = foreign!.id;
    await pg.handle.db.update(t.evalBatches).set({ workspaceId, snapshot: corrupted }).where(eq(t.evalBatches.id, batch.id));
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${batch.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${f.agent.id}/eval-runs` })).statusCode).toBe(404);
    await pg.handle.db.update(t.evalBatches).set({ snapshot: batch.snapshot }).where(eq(t.evalBatches.id, batch.id));
    expect(structured).not.toHaveBeenCalled();
  });

  it('startup reaps orphan running batches, retaining even all completed group evidence with failed/null aggregate result', async () => {
    const f = await fixture(); await convert(f.finding.id); const repository = new EvalsRepository(pg.handle.db);
    const orphan = await repository.start(workspaceId, f.agent.id), item = orphan.snapshot.cases[0]!;
    orphan.groups[0] = { ...orphan.groups[0]!, status: 'completed', candidates: [candidate()], ...scoreGroup([item], [candidate()], item.input_files), raw_output: 'KNOWN_RAW', structured_calls: 1, structured_attempts: 1 };
    await repository.save(workspaceId, summarize(orphan));
    const restarted = await buildApp(options());
    try {
      const result = await restarted.inject({ method: 'GET', url: `/eval-runs/${orphan.id}` }); expect(result.statusCode).toBe(200);
      const reaped = EvalBatchDetail.parse(result.json()); expect(reaped).toMatchObject({ status: 'failed', groups_succeeded: 1, metrics: { recall: null, precision: null, citation_accuracy: null } });
      expect(reaped.error).toContain('API restart'); expect(reaped.groups[0]!.raw_output).toBe('KNOWN_RAW'); expect(reaped.groups[0]!.candidates).toEqual([candidate()]);
      const retry = await repository.start(workspaceId, f.agent.id); await repository.interrupt(workspaceId, retry.id, 'Fixture released');
    } finally { await restarted.close(); }
    expect(structured).not.toHaveBeenCalled();
  });

  it('rejects unknown IDs, foreign agents and invalid UUID/body shape before source/provider work', async () => {
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-api' }).returning();
    const [agent] = await pg.handle.db.insert(t.agents).values({ workspaceId: foreign!.id, name: 'Foreign', provider: 'anthropic', model: 'f', systemPrompt: 'f' }).returning();
    for (const id of [randomUUID(), agent!.id]) {
      expect((await start(id)).statusCode).toBe(404); expect((await app.inject({ method: 'GET', url: `/agents/${id}/eval-cases` })).statusCode).toBe(404);
    }
    expect((await convert(randomUUID())).statusCode).toBe(404); expect((await app.inject({ method: 'GET', url: `/eval-runs/${randomUUID()}` })).statusCode).toBe(404);
    expect((await convert('bad')).statusCode).toBe(422); expect((await start('bad')).statusCode).toBe(422);
    const f = await fixture(); expect((await app.inject({ method: 'POST', url: `/findings/${f.finding.id}/eval-case`, payload: { owner_id: agent!.id } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/agents/${f.agent.id}/eval-runs`, payload: { model: 'override' } })).statusCode).toBe(422); expect(structured).not.toHaveBeenCalled();
  });
});
