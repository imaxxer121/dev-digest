import { createHash } from 'node:crypto';
import { VerifiedCiArtifact, RunTrace } from '@devdigest/shared';
import { gateTriggered } from '@devdigest/reviewer-core';
import type { CiArtifactEnvelope } from './ports.js';
import { ValidationError } from '../../platform/errors.js';

function workflowMatches(text: string, expectedDigest: string): boolean {
  // Git may convert a Windows export from CRLF to LF. Preserve every other
  // byte, including comments, indentation, permissions and shell commands.
  const lf = text.replace(/\r\n/g, '\n');
  return [text, lf, lf.replace(/\n/g, '\r\n')].some(value =>
    createHash('sha256').update(value).digest('hex') === expectedDigest);
}

export function verifyArtifact(envelope: CiArtifactEnvelope, installation: { repo: string; agentId: string; manifestDigest: string; workflowDigest: string; runtimeProvider: string; runtimeModel: string; failOn: string; bundleDigests: Record<string, string> }) {
  const artifact = VerifiedCiArtifact.parse(envelope.artifact);
  if (envelope.event !== 'pull_request' || envelope.status !== 'completed' || envelope.workflowPath !== '.github/workflows/devdigest-review.yml' ||
    artifact.repo !== installation.repo || envelope.repo !== installation.repo || artifact.repository_id !== envelope.repositoryId ||
    artifact.github_run_id !== envelope.runId || artifact.github_run_attempt !== envelope.attempt || artifact.pr_number !== envelope.prNumber ||
    artifact.head_sha !== envelope.headSha || artifact.workflow_sha !== envelope.workflowSha || artifact.agent_id !== installation.agentId ||
    artifact.manifest_digest !== installation.manifestDigest || artifact.provider !== installation.runtimeProvider || artifact.model !== installation.runtimeModel ||
    artifact.fail_on !== installation.failOn || !workflowMatches(envelope.workflow, installation.workflowDigest)) {
    throw new ValidationError('GitHub artifact provenance does not match this installation');
  }
  if (!Object.keys(installation.bundleDigests).length || Object.entries(installation.bundleDigests).some(([path, digest]) => envelope.trustedFileDigests[path] !== digest)) throw new ValidationError('Trusted base runner or agent configuration differs from this installation');
  const trace = RunTrace.parse(artifact.trace);
  if (trace.config.source !== 'ci' || trace.source_head_sha !== artifact.head_sha || trace.config.provider !== artifact.provider || trace.config.model !== artifact.model ||
    trace.config.agent !== artifact.agent || trace.config.version !== String(artifact.agent_version) || trace.config.pr !== artifact.pr_number ||
    trace.stats.duration_ms !== artifact.duration_ms || trace.stats.cost_usd !== artifact.cost_usd ||
    trace.stats.tokens_in !== artifact.tokens_in || trace.stats.tokens_out !== artifact.tokens_out || trace.stats.findings !== artifact.findings.length) throw new ValidationError('CI trace identity or accounting mismatch');
  const expected = gateTriggered(artifact.findings, artifact.fail_on) ? 'request_changes' : artifact.findings.length ? 'comment' : 'approve';
  if (artifact.verdict !== expected) throw new ValidationError('CI verdict disagrees with deterministic gate');
  return { artifact, trace };
}
