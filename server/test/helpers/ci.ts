import { createHash, randomUUID } from 'node:crypto';
import { VerifiedCiArtifact, RunTrace } from '@devdigest/shared';
import type { CiArtifactEnvelope } from '../../src/modules/ci/ports.js';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const CI_HEAD = 'a'.repeat(40), CI_BASE = 'b'.repeat(40);
export function ciFixture(agentId = randomUUID(), manifestDigest = 'c'.repeat(64), workflow = 'name: Fixture\n') {
  const trace = RunTrace.parse({ source_diff: 'diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -0,0 +1 @@\n+export const x = 1;\n', source_head_sha: CI_HEAD,
    source_pr: { title: 'Fixture PR', description: null }, config: { agent: 'Fixture reviewer', provider: 'ollama', model: 'fixture-model', version: '1', pr: 7, source: 'ci' },
    stats: { duration_ms: 210, tokens_in: 7, tokens_out: 3, cost_usd: null, findings: 0, grounding: '0/0 passed' },
    prompt_assembly: { system: 'Fixture system', user: 'Fixture user' }, tool_calls: [], raw_output: '{"findings":[]}', memory_pulled: [], specs_read: [], log: [] });
  const artifact = VerifiedCiArtifact.parse({ schema_version: '2', agent_id: agentId, agent: 'Fixture reviewer', agent_version: 1, manifest_digest: manifestDigest,
    provider: 'ollama', model: 'fixture-model', version: '2', dependency_versions: { zod: 'fixture' }, repo: 'fixture/ci', repository_id: 42, pr_number: 7, head_sha: CI_HEAD, workflow_sha: CI_BASE,
    workflow_path: '.github/workflows/devdigest-review.yml', github_run_id: 17, github_run_attempt: 1, github_job: 'review', verdict: 'approve', fail_on: 'critical', findings: [], findings_count: 0, cost_usd: null, duration_ms: 210, tokens_in: 7, tokens_out: 3, trace });
  const installation = { repo: 'fixture/ci', agentId, manifestDigest, workflowDigest: hash(workflow), runtimeProvider: 'ollama', runtimeModel: 'fixture-model', failOn: 'critical', bundleDigests: { '.devdigest/runner/index.js': hash('fixture runner') } };
  const envelope: CiArtifactEnvelope = { runId: 17, attempt: 1, repositoryId: 42, repo: 'fixture/ci', event: 'pull_request', status: 'completed', workflowPath: '.github/workflows/devdigest-review.yml', workflowSha: CI_BASE, headSha: CI_HEAD, prNumber: 7, workflow, artifact, htmlUrl: 'https://github.com/fixture/ci/actions/runs/17', createdAt: '2026-10-13T12:00:00Z', trustedFileDigests: installation.bundleDigests };
  return { artifact, trace, envelope, installation };
}
