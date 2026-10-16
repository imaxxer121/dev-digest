import { assemblePrompt } from '@devdigest/reviewer-core';
import { AttachedDocuments, type AttachedDocument, type ProjectContextTrace } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { CONTEXT_LIMITS, type ContextEstimator, type ProjectContextFiles } from './ports.js';

export interface ContextOwner { id: string; workspaceId: string; attachedDocs?: AttachedDocument[] | null }
export interface ContextSkill extends ContextOwner { enabled: boolean }
export interface ResolvedProjectContext { readonly specs: readonly string[]; readonly trace: ProjectContextTrace }

export class ProjectContextService {
  private repos: RepoRepository;
  constructor(private container: Container, private files: ProjectContextFiles, private estimator: ContextEstimator) { this.repos = new RepoRepository(container.db); }
  private async repo(workspaceId: string, repoId: string) {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
  async list(workspaceId: string, repoId: string) { const repo = await this.repo(workspaceId, repoId); return this.files.discover(repo.clonePath); }
  private async read(cloneRoot: string | null, path: string) {
    try { return await this.files.read(cloneRoot, path); }
    catch (error) { if (error instanceof ValidationError) throw error; throw new ValidationError('Missing, unreadable or changed document'); }
  }
  async preview(workspaceId: string, repoId: string, path: string) { const repo = await this.repo(workspaceId, repoId); return this.read(repo.clonePath, path); }
  async validateAttachments(workspaceId: string, input: AttachedDocument[]): Promise<AttachedDocument[]> {
    const docs = AttachedDocuments.parse(input);
    // All ownership checks precede ALL filesystem work, including earlier valid bindings.
    const repos = new Map<string, Awaited<ReturnType<ProjectContextService['repo']>>>();
    for (const doc of docs) if (!repos.has(doc.repo_id)) repos.set(doc.repo_id, await this.repo(workspaceId, doc.repo_id));
    for (const doc of docs) {
      if (!this.files.accepts(doc.path)) throw new ValidationError('Document outside configured context roots');
      await this.read(repos.get(doc.repo_id)!.clonePath, doc.path);
    }
    return docs.map(doc => ({ ...doc }));
  }
  /** T4 supplies only successfully loaded Skills in saved link order. No selection/model/network work. */
  async resolveForAgent(workspaceId: string, repoId: string, agent: ContextOwner, loadedSkills: readonly ContextSkill[]): Promise<ResolvedProjectContext> {
    if (agent.workspaceId !== workspaceId) throw new NotFoundError('Agent not found');
    const actual = await this.container.agentsRepo.getById(workspaceId, agent.id);
    if (!actual) throw new NotFoundError('Agent not found');
    const repo = await this.repo(workspaceId, repoId);
    // Recheck linked identities and workspace; caller cannot forge a loaded foreign/detached skill.
    const linked = await this.container.agentsRepo.linkedSkills(agent.id);
    const loadedIds = new Set(loadedSkills.filter(skill => skill.enabled && skill.workspaceId === workspaceId).map(skill => skill.id));
    const skills = linked.filter(link => link.skill.workspaceId === workspaceId && link.skill.enabled && loadedIds.has(link.skill.id));
    const sources = [actual.attachedDocs ?? [], ...skills.map(link => link.skill.attachedDocs ?? [])];
    const specs: string[] = [], seen = new Set<string>();
    const trace: ProjectContextTrace = { reads: [], skipped: [], estimated_tokens: 0, estimate_method: this.estimator.method, bytes: 0,
      token_limit: CONTEXT_LIMITS.tokens, document_byte_limit: CONTEXT_LIMITS.documentBytes };
    for (const docs of sources) for (const doc of docs) {
      if (doc.repo_id !== repoId) continue;
      const key = `${doc.repo_id}/${doc.path}`; if (seen.has(key)) continue; seen.add(key);
      try {
        if (docs.length > CONTEXT_LIMITS.attachments) throw new ValidationError('Attachment count limit exceeded');
        const { content, ...read } = await this.files.read(repo.clonePath, doc.path);
        if (!content.trim()) throw new ValidationError('Empty document');
        // The source identity lives inside core's guarded block, never in a raw XML attribute.
        const spec = `Repository document ${JSON.stringify({ repo_id: repoId, path: doc.path })}\n\n${content}`;
        const block = assemblePrompt({ system: '', diff: '', specs: [...specs, spec] }).assembly.specs ?? '';
        if (this.estimator.count(block) > CONTEXT_LIMITS.tokens) throw new ValidationError('Assembled context exceeds 8000 estimated tokens; whole document skipped');
        specs.push(spec); trace.reads.push({ repo_id: repoId, ...read });
      } catch (error) { trace.skipped.push({ repo_id: repoId, path: doc.path, reason: error instanceof ValidationError ? error.message : 'Missing, unreadable or changed document' }); }
    }
    const block = assemblePrompt({ system: '', diff: '', specs }).assembly.specs ?? '';
    trace.estimated_tokens = this.estimator.count(block); trace.bytes = Buffer.byteLength(block, 'utf8');
    // Immutable independent snapshots survive map/reduce chunks and concurrent peers.
    for (const read of trace.reads) Object.freeze(read);
    for (const skip of trace.skipped) Object.freeze(skip);
    Object.freeze(trace.reads); Object.freeze(trace.skipped); Object.freeze(trace);
    return Object.freeze({ specs: Object.freeze([...specs]), trace });
  }
  measureBlock(block: string | null | undefined) { return { estimated_tokens: this.estimator.count(block ?? ''), estimate_method: this.estimator.method, bytes: Buffer.byteLength(block ?? '', 'utf8') }; }
}
