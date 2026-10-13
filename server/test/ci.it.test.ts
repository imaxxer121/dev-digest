import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';
import { ciFixture, hash, CI_HEAD } from './helpers/ci.js';
import type { CiArtifactEnvelope } from '../src/modules/ci/ports.js';

describe('L07 CI export and verified ingestion (required isolated PostgreSQL)', () => {
  let pg: PgFixture, app: FastifyInstance, workspaceId: string, agentId: string, envelope: CiArtifactEnvelope;
  const retrieve = vi.fn(async () => envelope), runner = { 'index.js': '// fixture runner', '300.index.js': '// fixture chunk', 'package.json': '{"type":"module"}' };
  const input = { repo: 'fixture/ci', base: 'integration', action: 'files', runtime: { provider: 'ollama', model: 'fixture-model' }, post_as: 'none' };
  const exportFiles = () => app.inject({ method: 'POST', url: `/agents/${agentId}/export-ci`, payload: input });
  beforeAll(async () => {
    if (!await dockerAvailable()) throw new Error('CI integration requires isolated PostgreSQL; cannot skip');
    pg = await startPg(); ({ workspaceId } = await seed(pg.handle.db));
    app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' }), db: pg.handle.db,
      overrides: { ciGithub: { retrieve }, ciRunner: async () => runner } });
    const [agent] = await pg.handle.db.insert(t.agents).values({ workspaceId, name: 'CI fixture', provider: 'codex', model: 'studio-fixture', systemPrompt: 'Fixture prompt' }).returning(); agentId = agent!.id;
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId, owner: 'fixture', name: 'ci', fullName: 'fixture/ci' }).returning();
    await pg.handle.db.insert(t.pullRequests).values({ workspaceId, repoId: repo!.id, number: 7, title: 'Fixture PR', author: 'fixture', branch: 'feature', base: 'integration', headSha: CI_HEAD });
    await pg.handle.db.insert(t.memory).values({ workspaceId, repoId: repo!.id, scope: 'repo', kind: 'convention', content: 'Fixture memory' });
  }, 120000);
  afterAll(async () => { await app?.close(); await pg?.stop(); });
  it('requires an explicit hosted runtime override for a subscription studio agent', async () => {
    const response = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci-preview`, payload: { repo: 'fixture/ci', action: 'files' } });
    expect(response.statusCode).toBe(422); expect(response.body).toContain('explicit Ollama');
  });
  it('previews saved config, actual memory and every runner chunk without starting inference or writing GitHub', async () => {
    const response = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci-preview`, payload: input });
    expect(response.statusCode).toBe(200);
    const value = response.json(); expect(value.manifest).toMatchObject({ provider: 'ollama', model: 'fixture-model', agent_id: agentId });
    expect(value.files.some((file: { path: string }) => file.path === '.devdigest/runner/300.index.js')).toBe(true);
    expect(value.files.find((file: { path: string }) => file.path === '.devdigest/memory.jsonl').contents).toContain('Fixture memory');
    expect(value.files.find((file: { path: string }) => file.path.endsWith('.yml')).contents).toContain(`DEVDIGEST_MANIFEST: agents/agent-${agentId}.yaml`);
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('downloads a real ZIP and keeps exported status until verified execution', async () => {
    const response = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci-zip`, payload: input });
    expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toContain('application/zip');
    const archive = unzipSync(new Uint8Array(response.rawPayload));
    expect(strFromU8(archive['.devdigest/runner/300.index.js']!)).toBe(runner['300.index.js']);
    const [row] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.id, response.headers['x-devdigest-installation'] as string));
    expect(row!.status).toBe('exported'); expect(row!.workspaceId).toBe(workspaceId);
  });
  it('keeps explicit manifest selection stable across agent rename', async () => {
    const before = (await exportFiles()).json(); await pg.handle.db.update(t.agents).set({ name: 'Renamed CI fixture' }).where(eq(t.agents.id, agentId));
    const after = (await exportFiles()).json();
    expect(before.files.find((file: { path: string }) => file.path.endsWith('.yaml')).path).toBe(after.files.find((file: { path: string }) => file.path.endsWith('.yaml')).path);
  });
  async function prepared() {
    const response = await exportFiles(); expect(response.statusCode).toBe(200); const value = response.json();
    const workflow = value.files.find((file: { path: string }) => file.path.endsWith('.yml')).contents;
    const fixture = ciFixture(agentId, value.installation.manifest_digest, workflow);
    envelope = { ...fixture.envelope, trustedFileDigests: Object.fromEntries(value.files.filter((file: { path: string }) => file.path.startsWith('.devdigest/')).map((file: { path: string; contents: string }) => [file.path, hash(file.contents)])) };
    return value;
  }
  it('verifies authenticated artifact, persists original source=ci run/trace and a linked review', async () => {
    const value = await prepared(); const response = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: value.installation.id, run_id: 17 } });
    expect(response.statusCode).toBe(200); expect(response.json().created).toBe(true);
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, response.json().run.run_id));
    expect(run).toMatchObject({ source: 'ci', model: 'fixture-model', tokensIn: 7, costUsd: null, status: 'done' });
    const [trace] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, run!.id)); expect(trace!.trace).toEqual((envelope.artifact as { trace: unknown }).trace);
    const [review] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, run!.id)); expect(review!.workspaceId).toBe(workspaceId);
  });
  it('deduplicates concurrent imports through duplicate installation exports by numeric repo/run/attempt', async () => {
    const a = await prepared(), b = await prepared();
    const responses = await Promise.all([a, b].map(value => app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: value.installation.id, run_id: 17 } })));
    expect(responses.map(response => response.statusCode)).toEqual([200, 200]); expect(responses.every(response => response.json().created === false)).toBe(true);
    const runs = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci')); expect(runs.length).toBe(1);
    const counts = async () => ({ runs: (await pg.handle.db.select().from(t.agentRuns)).length, ci: (await pg.handle.db.select().from(t.ciRuns)).length,
      reviews: (await pg.handle.db.select().from(t.reviews)).length, findings: (await pg.handle.db.select().from(t.findings)).length });
    const before = await counts();
    const artifact = envelope.artifact as ReturnType<typeof ciFixture>['artifact'];
    const finding = { id: 'fixture-critical', severity: 'CRITICAL' as const, category: 'security' as const, file: 'src/x.ts', start_line: 1, end_line: 1, title: 'Fixture finding', rationale: 'Fixture rationale', confidence: 1 };
    envelope = { ...envelope, runId: 18, htmlUrl: 'https://github.com/fixture/ci/actions/runs/18', artifact: { ...artifact, github_run_id: 18,
      findings: [finding], findings_count: 1, verdict: 'request_changes', trace: { ...artifact.trace, stats: { ...artifact.trace.stats, findings: 1, grounding: '1/1 passed' }, raw_output: JSON.stringify({ findings: [finding] }) } } };
    const fresh = await Promise.all([a, b].map(value => app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: value.installation.id, run_id: 18 } })));
    expect(fresh.map(response => response.statusCode)).toEqual([200, 200]);
    expect(fresh.map(response => response.json().created).sort()).toEqual([false, true]);
    expect(new Set(fresh.map(response => response.json().run.run_id)).size).toBe(1);
    const after = await counts();
    expect(Object.fromEntries(Object.entries(after).map(([key, count]) => [key, count - before[key as keyof typeof before]]))).toEqual({ runs: 1, ci: 1, reviews: 1, findings: 1 });
  });
  it('rejects workflow/config provenance changes before saving anything', async () => {
    const value = await prepared(); envelope = { ...envelope, workflow: envelope.workflow + 'malicious: true\n' };
    const response = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: value.installation.id, run_id: 17 } });
    expect(response.statusCode).toBe(422);
    expect((await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'))).length).toBe(2);
  });
  it('workspace-scopes agent/repository/installation reads before external I/O and has no plain JSON ingest endpoint', async () => {
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'Foreign CI' }).returning();
    const [foreignAgent] = await pg.handle.db.insert(t.agents).values({ workspaceId: foreign!.id, name: 'Foreign', provider: 'codex', model: 'x', systemPrompt: 'x' }).returning();
    const [installation] = await pg.handle.db.insert(t.ciInstallations).values({ workspaceId: foreign!.id, agentId: foreignAgent!.id, repo: 'fixture/ci', targetType: 'gha' }).returning();
    const count = retrieve.mock.calls.length;
    expect((await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: installation!.id, run_id: 17 } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${foreignAgent!.id}/ci-preview`, payload: input })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${agentId}/ci-preview`, payload: { ...input, repo: 'foreign/not-imported' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/ci/ingest', payload: envelope.artifact })).statusCode).toBe(404);
    expect(retrieve.mock.calls.length).toBe(count);
    expect((await app.inject({ method: 'GET', url: '/ci/installations' })).json().some((row: { id: string }) => row.id === installation!.id)).toBe(false);
  });
});
