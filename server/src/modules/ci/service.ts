import { zipSync, strToU8 } from 'fflate';
import { AgentManifest, CiExportInput, type CiFile, type CiRun, type CiInstallation, VerifiedCiArtifact, type CiExportInputBody } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { CiRepository, type InstallationRow } from './repository.js';
import type { CiDependencies } from './ports.js';
import { generateWorkflow, validateEditedWorkflow, sha256, WORKFLOW_PATH } from './workflow.js';
import { verifyArtifact } from './provenance.js';

export function installationRecord(row: InstallationRow): CiInstallation {
  return { id: row.id, agent_id: row.agentId, repo: row.repo, target_type: 'gha', installed_at: row.installedAt.toISOString(), status: row.status as CiInstallation['status'],
    workflow_version: row.workflowVersion, manifest_digest: row.manifestDigest, workflow_digest: row.workflowDigest, runtime_provider: row.runtimeProvider, runtime_model: row.runtimeModel, fail_on: row.failOn as CiInstallation['fail_on'] };
}
const slug = (name: string, id: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'agent'}-${id.slice(0, 8)}`;
export class CiService {
  private repo: CiRepository;
  constructor(private container: Container, private deps: CiDependencies) { this.repo = new CiRepository(container.db); }
  async preview(workspaceId: string, agentId: string, raw: CiExportInputBody) {
    const input = CiExportInput.parse(raw);
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await this.repo.repo(workspaceId, input.repo);
    if (!repo) throw new NotFoundError('Import the target repository before exporting');
    const runtime = input.runtime ?? (agent.provider === 'openrouter' ? { provider: 'openrouter' as const, model: agent.model } : undefined);
    if (!runtime) throw new ValidationError('This studio provider cannot run in hosted CI. Select the explicit Ollama CI runtime override or OpenRouter.');
    const skills = (await this.container.agentsRepo.linkedSkills(agentId)).filter(link => link.skill.enabled);
    if (skills.some(link => link.skill.workspaceId !== workspaceId)) throw new NotFoundError('Linked Skill not found');
    const manifest = AgentManifest.parse({ schema_version: '2', agent_id: agent.id, agent_version: agent.version, name: agent.name,
      provider: runtime.provider, model: runtime.model, system_prompt: agent.systemPrompt, skills: skills.map(link => slug(link.skill.name, link.skill.id)), strategy: agent.strategy, ci_fail_on: input.ci_fail_on ?? agent.ciFailOn });
    const generated = generateWorkflow(input, manifest);
    const workflow = input.workflow === undefined ? generated : validateEditedWorkflow(input.workflow, generated);
    const bundle = await this.deps.ciRunner();
    if (!bundle['index.js']?.trim() || Object.values(bundle).some(file => file.length > 12_000_000) || Object.keys(bundle).some(name => !/^[a-zA-Z0-9_.-]{1,100}$/.test(name) || name === '.' || name === '..')) throw new ConfigError('Build the bundled agent-runner before export');
    const memory = await this.repo.memory(workspaceId, repo.id);
    const memoryText = memory.map(entry => JSON.stringify(entry)).join('\n') + (memory.length ? '\n' : '');
    if (memory.length > 128 || memory.some(entry => entry.content.length > 8000) || Buffer.byteLength(memoryText, 'utf8') > 128_000) throw new ValidationError('Exported memory exceeds the CI runner budget; curate the saved memory before export');
    const files: CiFile[] = [
      { path: `.devdigest/agents/agent-${agent.id}.yaml`, contents: `${JSON.stringify(manifest, null, 2)}\n`, editable: false },
      ...skills.map(link => ({ path: `.devdigest/skills/${slug(link.skill.name, link.skill.id)}.md`, contents: link.skill.body, editable: false })),
      { path: '.devdigest/memory.jsonl', contents: memoryText, editable: false },
      ...Object.entries(bundle).map(([name, contents]) => ({ path: `.devdigest/runner/${name}`, contents, editable: false })),
      { path: WORKFLOW_PATH, contents: workflow, editable: true },
    ];
    return { files, manifest, manifest_digest: await sha256(JSON.stringify(manifest)), workflow_digest: await sha256(workflow) };
  }
  async export(workspaceId: string, agentId: string, raw: CiExportInputBody) {
    const input = CiExportInput.parse(raw), preview = await this.preview(workspaceId, agentId, input);
    let prUrl: string | null = null;
    if (input.action === 'open_pr') {
      const github = await this.container.github();
      const [owner, name] = input.repo.split('/') as [string, string];
      await github.commitFiles({ owner, name }, { branch: 'devdigest/ci', base: input.base, message: 'Add DevDigest CI review', files: preview.files });
      prUrl = (await github.findOpenPr({ owner, name }, 'devdigest/ci'))?.url ?? (await github.openPullRequest({ owner, name }, { head: 'devdigest/ci', base: input.base,
        title: 'Add DevDigest CI review', body: `Run ${preview.manifest.name} through grounded reviewer-core in GitHub Actions.\n\nCI runtime: ${preview.manifest.provider}/${preview.manifest.model}. Fail on: ${preview.manifest.ci_fail_on}. Configure the DevDigest review required status check to block merges.` })).url;
    }
    const row = await this.repo.create({ workspaceId, agentId, repo: input.repo, targetType: 'gha', status: prUrl ? 'pending' : 'exported', manifestDigest: preview.manifest_digest, workflowDigest: preview.workflow_digest,
      runtimeProvider: preview.manifest.provider, runtimeModel: preview.manifest.model, failOn: preview.manifest.ci_fail_on, workflowVersion: '2',
      bundleDigests: Object.fromEntries(await Promise.all(preview.files.filter(file => file.path.startsWith('.devdigest/')).map(async file => [file.path, await sha256(file.contents)]))) });
    return { installation: installationRecord(row), files: preview.files, pr_url: prUrl };
  }
  async zip(workspaceId: string, agentId: string, input: CiExportInputBody) {
    const exported = await this.export(workspaceId, agentId, { ...input, action: 'files' });
    return { installation: exported.installation, bytes: zipSync(Object.fromEntries(exported.files.map(file => [file.path, strToU8(file.contents)])), { level: 6 }) };
  }
  async installations(workspaceId: string, agentId?: string) { return (await this.repo.installations(workspaceId, agentId)).map(installationRecord); }
  private runRecord(row: Awaited<ReturnType<CiRepository['runs']>>[number]): CiRun {
    const value = VerifiedCiArtifact.safeParse(row.run.artifact);
    const a = value.success ? value.data : null;
    return { id: row.run.id, ci_installation_id: row.run.ciInstallationId, pr_number: row.run.prNumber, ran_at: row.run.ranAt?.toISOString() ?? null, status: row.run.status,
      findings_count: row.run.findingsCount, cost_usd: row.run.costUsd, github_url: row.run.githubUrl, source: row.run.source, agent: a?.agent, duration_s: a ? a.duration_ms / 1000 : null,
      repo: row.installation.repo, verdict: a?.verdict, provider: a?.provider, model: a?.model, tokens_in: a?.tokens_in, tokens_out: a?.tokens_out, run_id: row.run.agentRunId, head_sha: a?.head_sha, workflow_version: row.installation.workflowVersion, finding_details: a?.findings };
  }
  async runs(workspaceId: string, agentId?: string) { return (await this.repo.runs(workspaceId, agentId)).map(row => this.runRecord(row)); }
  async refresh(workspaceId: string, installationId: string, runId: number) {
    const installation = await this.repo.get(workspaceId, installationId);
    if (!installation) throw new NotFoundError('CI installation not found');
    const envelope = await (await this.deps.ciGithub()).retrieve(installation.repo, runId, Object.keys(installation.bundleDigests));
    const { artifact, trace } = verifyArtifact(envelope, installation);
    const saved = await this.repo.ingest(workspaceId, installation, envelope, artifact, trace);
    return { created: saved.created, run: this.runRecord({ run: saved.run, installation }) };
  }
}
