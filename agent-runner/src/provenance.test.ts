import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VerifiedCiArtifact, type LLMProvider, type StructuredRequest } from '@devdigest/shared';
import { runCi } from './run.js';
import { loadManifest } from './manifest.js';
describe('CI exact revision and manifest selection', () => {
  let directory: string;
  afterEach(() => { if (directory) { if (!directory.startsWith(join(tmpdir(), 'devdigest-ci-'))) throw new Error('Unexpected cleanup path'); rmSync(directory, { recursive: true, force: true }); } });
  function fixture() {
    directory = mkdtempSync(join(tmpdir(), 'devdigest-ci-')); mkdirSync(join(directory, 'agents')); mkdirSync(join(directory, 'skills'));
    const head = 'a'.repeat(40), base = 'b'.repeat(40), agentId = randomUUID();
    writeFileSync(join(directory, 'agents', 'selected.yaml'), JSON.stringify({ agent_id: agentId, name: 'Fixture', provider: 'ollama', model: 'fixture-model', system_prompt: 'Fixture', skills: [], strategy: 'single-pass', ci_fail_on: 'critical' }));
    writeFileSync(join(directory, 'agents', 'unused.yaml'), 'not a valid agent');
    writeFileSync(join(directory, 'event.json'), JSON.stringify({ pull_request: { number: 7, title: 'Fixture title', head: { sha: head, repo: { fork: false } } } }));
    const env = { GITHUB_REPOSITORY: 'fixture/ci', GITHUB_TOKEN: 'fixture-not-a-real-token', GITHUB_EVENT_PATH: join(directory, 'event.json'), DEVDIGEST_MANIFEST: 'agents/selected.yaml', DEVDIGEST_WORKFLOW_SHA: base, GITHUB_RUN_ID: '17', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'review' };
    const complete = vi.fn(async <T>(request: StructuredRequest<T>) => ({ data: request.schema.parse({ verdict: 'approve', summary: 'Fixture', score: 100, findings: [] }), model: request.model, raw: '{"findings":[]}', tokensIn: 11, tokensOut: 3, costUsd: null, attempts: 1 }));
    const provider: LLMProvider = { id: 'ollama', completeStructured: complete as LLMProvider['completeStructured'], complete: async () => { throw new Error('Unexpected'); }, embed: async () => [], listModels: async () => [] };
    const identity = { headSha: head, repositoryId: 42, title: 'Fixture title', body: '', fork: false };
    const fetchIdentity = vi.fn(async () => identity), fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response('{}', { status: 201 }));
    const deps = { devdigestDir: directory, resultPath: join(directory, 'result.json'), env, llm: provider, postAs: 'github_review' as const, fetchIdentity, fetchImpl, fetchDiff: async () => 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1 @@\n+export const x = 1;\n' };
    return { deps, identity, fetchIdentity, fetchImpl, complete, head };
  }
  it('selects one explicit manifest among multiple files and rejects escaping paths', () => {
    const f = fixture(); expect(loadManifest(directory, {}, f.deps.env.DEVDIGEST_MANIFEST).name).toBe('Fixture');
    expect(() => loadManifest(directory, {}, '../secrets.yaml')).toThrow('Selected manifest');
  });
  it('refuses a queued workflow for an older event head before inference', async () => {
    const f = fixture(); f.fetchIdentity.mockResolvedValue({ ...f.identity, headSha: 'c'.repeat(40) });
    const result = await runCi(f.deps); expect(result.error).toContain('triggering event'); expect(f.complete).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rechecks after delayed inference and refuses stale publication', async () => {
    const f = fixture(); f.fetchIdentity.mockResolvedValueOnce(f.identity).mockResolvedValueOnce(f.identity).mockResolvedValueOnce({ ...f.identity, headSha: 'c'.repeat(40) });
    const result = await runCi(f.deps); expect(result.error).toContain('stale publication'); expect(f.complete).toHaveBeenCalledTimes(1); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('writes the strict full artifact and posts a review bound to the captured commit', async () => {
    const f = fixture(); const result = await runCi(f.deps); expect(result.exitCode).toBe(0);
    const artifact = VerifiedCiArtifact.parse(JSON.parse(readFileSync(f.deps.resultPath, 'utf8')));
    expect(artifact).toMatchObject({ head_sha: f.head, tokens_in: 11, tokens_out: 3, provider: 'ollama', model: 'fixture-model' });
    expect(JSON.parse(f.fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({ commit_id: f.head, event: 'COMMENT' });
  });
});
