// Runs the exported files with no node_modules. Inference/GitHub are injected
// fixtures here; this smoke test makes no claim about actual model quality.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), 'devdigest-bundle-'));
try {
  const target = join(directory, '.devdigest');
  mkdirSync(join(target, 'runner'), { recursive: true }); mkdirSync(join(target, 'agents')); mkdirSync(join(target, 'skills'));
  for (const name of ['index.js', '300.index.js', 'package.json']) copyFileSync(join(packageDir, 'dist', name), join(target, 'runner', name));
  const head = 'a'.repeat(40), base = 'b'.repeat(40), agentId = '11111111-1111-4111-8111-111111111111';
  writeFileSync(join(target, 'agents', 'fixture.yaml'), JSON.stringify({ schema_version: '2', agent_id: agentId, agent_version: 1, name: 'Bundle fixture', provider: 'ollama', model: 'fixture-model', system_prompt: 'Review fixture only', skills: [], strategy: 'single-pass', ci_fail_on: 'critical' }));
  writeFileSync(join(directory, 'event.json'), JSON.stringify({ pull_request: { number: 7, head: { sha: head, repo: { fork: false } }, title: 'Fixture' } }));
  const env = { GITHUB_REPOSITORY: 'fixture/ci', GITHUB_TOKEN: 'fixture-not-a-real-token', GITHUB_EVENT_PATH: join(directory, 'event.json'), GITHUB_RUN_ID: '17', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'review', DEVDIGEST_DIR: target, DEVDIGEST_MANIFEST: 'agents/fixture.yaml', DEVDIGEST_WORKFLOW_SHA: base, DEVDIGEST_POST_AS: 'github_review', DEVDIGEST_RESULT_PATH: join(directory, 'result.json') };
  writeFileSync(join(directory, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main } from './.devdigest/runner/index.js';
const env = ${JSON.stringify(env)};
let modelCalls = 0, posts = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'http://127.0.0.1:11434/api/chat') {
    modelCalls++;
    return new Response(JSON.stringify({ done: true, prompt_eval_count: 23, eval_count: 11, message: { content: JSON.stringify({ verdict: 'approve', summary: 'Fixture', score: 99, findings: [{ id: 'fixture', severity: 'CRITICAL', category: 'security', title: 'Fixture issue', file: 'x.ts', start_line: 1, end_line: 1, rationale: 'Fixture rationale', confidence: 1, kind: 'finding' }] }) } }));
  }
  if (url === 'https://api.github.com/repos/fixture/ci/pulls/7/reviews' && init?.method === 'POST') {
    posts++; const body = JSON.parse(init.body); assert.equal(body.commit_id, '${head}'); assert.equal(body.event, 'REQUEST_CHANGES'); return new Response('{}', { status: 201 });
  }
  if (url === 'https://api.github.com/repos/fixture/ci/pulls/7') {
    if (init?.headers?.Accept === 'application/vnd.github.v3.diff') return new Response('diff --git a/x.ts b/x.ts\\n--- a/x.ts\\n+++ b/x.ts\\n@@ -0,0 +1 @@\\n+export const x = 1;\\n');
    return new Response(JSON.stringify({ title: 'Fixture', body: '', head: { sha: '${head}', repo: { id: 42 } }, base: { repo: { id: 42 } } }));
  }
  throw new Error('Unexpected fixture network path: ' + url);
};
const code = await main(env); assert.equal(code, 1); assert.equal(modelCalls, 1); assert.equal(posts, 1);
const artifact = JSON.parse(readFileSync(env.DEVDIGEST_RESULT_PATH, 'utf8'));
assert.equal(artifact.schema_version, '2'); assert.equal(artifact.verdict, 'request_changes'); assert.equal(artifact.tokens_in, 23); assert.equal(artifact.findings_count, 1); assert.equal(artifact.head_sha, '${head}');
console.log('[bundle-smoke] Standalone export executed real reviewer-core with injected fixture inference; grounding, commit-bound publication, gate and artifact passed.');
`);
  const result = spawnSync(process.execPath, [join(directory, 'smoke.mjs')], { cwd: directory, env: { SystemRoot: process.env.SystemRoot }, encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) throw new Error(`Standalone fixture smoke failed: ${result.error?.message ?? result.status}`);
} finally {
  if (!directory.startsWith(join(tmpdir(), 'devdigest-bundle-'))) throw new Error('Unexpected cleanup path');
  rmSync(directory, { recursive: true, force: true });
}
