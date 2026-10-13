import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AgentManifest, CiExportInput, VerifiedCiArtifact } from '@devdigest/shared';
import { generateWorkflow, validateEditedWorkflow } from '../src/modules/ci/workflow.js';
import { verifyArtifact } from '../src/modules/ci/provenance.js';
import { ciFixture } from './helpers/ci.js';
describe('safe CI export and authenticated provenance', () => {
  const manifest = AgentManifest.parse({ agent_id: '11111111-1111-4111-8111-111111111111', name: 'Fixture', provider: 'ollama', model: 'qwen2.5-coder:7b-instruct', system_prompt: 'Fixture', skills: [] });
  const input = CiExportInput.parse({ repo: 'fixture/ci', action: 'files', post_as: 'none' });
  it('pins actions/binary, uses trusted base, same-repo guard, bounded job and explicit publication', () => {
    const workflow = generateWorkflow(input, manifest);
    expect(workflow).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).toContain('persist-credentials: false'); expect(workflow).toContain('timeout-minutes: 30');
    expect(workflow).toContain('sha256sum --check'); expect(workflow).toContain('DEVDIGEST_POST_AS: none');
    expect(workflow).not.toContain('pull-requests: write'); expect(workflow).not.toContain('pull_request_target'); expect(workflow).not.toContain('secrets.');
    expect([...workflow.matchAll(/uses: [^@\n]+@([^\n]+)/g)].every(match => /^[a-f0-9]{40}$/.test(match[1]!))).toBe(true);
  });
  it('wires OpenRouter secret and minimum write permission only when posting', () => {
    const workflow = generateWorkflow({ ...input, post_as: 'pr_comment' }, { ...manifest, provider: 'openrouter' });
    expect(workflow).toContain('pull-requests: write'); expect(workflow).toContain('secrets.OPENROUTER_API_KEY'); expect(workflow).not.toContain('ollama serve');
  });
  it('allows safe title/comment edits but refuses execution/permission/PR-code changes', () => {
    const workflow = generateWorkflow(input, manifest);
    expect(validateEditedWorkflow(workflow.replace('name: DevDigest Review', 'name: My Review') + '# documentation\n', workflow)).toContain('My Review');
    for (const bad of [workflow.replace('contents: read', 'contents: write'), workflow.replace('node trusted/', 'bash untrusted/'), workflow + '  malicious: true\n']) expect(() => validateEditedWorkflow(bad, workflow)).toThrow();
  });
  it.each(['../x', 'a/b', 'x\\y', '$(echo bad)'])('rejects unsafe skill path %s', skill => expect(AgentManifest.safeParse({ ...manifest, skills: [skill] }).success).toBe(false));
  it('refuses unsupported providers/targets and shell-shaped models', () => {
    expect(AgentManifest.safeParse({ ...manifest, provider: 'codex' }).success).toBe(false);
    expect(CiExportInput.safeParse({ repo: 'fixture/ci', target: 'jenkins' }).success).toBe(false);
    expect(CiExportInput.safeParse({ repo: 'fixture/ci', runtime: { provider: 'ollama', model: 'x; echo leaked' } }).success).toBe(false);
  });
  it('accepts the verified envelope and distinguishes unavailable cost from zero', () => { const { envelope, installation } = ciFixture(); expect(verifyArtifact(envelope, installation).artifact.cost_usd).toBeNull(); });
  it('accepts Git newline conversion but rejects changed workflow content', () => {
    const { envelope, installation } = ciFixture();
    const lf = envelope.workflow.replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    const stored = { ...installation, workflowDigest: createHash('sha256').update(crlf).digest('hex') };
    expect(verifyArtifact({ ...envelope, workflow: lf }, stored).artifact.agent_id).toBe(installation.agentId);
    expect(verifyArtifact({ ...envelope, workflow: crlf }, installation).artifact.agent_id).toBe(installation.agentId);
    expect(() => verifyArtifact({ ...envelope, workflow: lf + 'malicious: true\n' }, stored)).toThrow();
    const generated = generateWorkflow(input, manifest);
    expect(validateEditedWorkflow(generated.replace(/\n/g, '\r\n'), generated)).toBe(generated);
  });
  it.each(['repositoryId', 'runId', 'attempt', 'prNumber', 'event', 'status', 'headSha', 'workflowSha', 'workflowPath', 'workflow', 'repo'])('rejects mismatched GitHub identity %s', key => {
    const { envelope, installation } = ciFixture(); const changed = { ...envelope, [key]: typeof envelope[key as keyof typeof envelope] === 'number' ? 100 : 'wrong' }; expect(() => verifyArtifact(changed, installation)).toThrow();
  });
  it('rejects PR-modified workflows and trusted-base runner/config changes', () => {
    const { envelope, installation } = ciFixture(); expect(() => verifyArtifact({ ...envelope, workflow: envelope.workflow + 'malicious: true\n' }, installation)).toThrow();
    expect(() => verifyArtifact({ ...envelope, trustedFileDigests: {} }, installation)).toThrow('configuration differs');
  });
  it('rejects legacy counts, mismatched findings, fake verdict and trace tokens', () => {
    const { artifact, envelope, installation } = ciFixture();
    expect(VerifiedCiArtifact.safeParse({ findings_count: 0, agent: 'x', cost_usd: null }).success).toBe(false);
    expect(VerifiedCiArtifact.safeParse({ ...artifact, findings_count: 1 }).success).toBe(false);
    expect(() => verifyArtifact({ ...envelope, artifact: { ...artifact, verdict: 'request_changes' } }, installation)).toThrow('deterministic gate');
    expect(() => verifyArtifact({ ...envelope, artifact: { ...artifact, tokens_in: 900 } }, installation)).toThrow('accounting mismatch');
  });
});
