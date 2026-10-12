import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository } from './repository.js';
import { toCandidate, conventionSkillBody } from './helpers.js';
import { runExtraction } from './extract-pipeline.js';
export class ConventionsService {
  private repo: ConventionsRepository;
  constructor(private container: Container) { this.repo = new ConventionsRepository(container.db); }
  async list(workspaceId: string, repoId: string) {
    if (!await this.repo.repo(workspaceId, repoId)) throw new NotFoundError('Repo not found');
    return (await this.repo.listForRepo(workspaceId, repoId)).map(toCandidate);
  }
  extract(workspaceId: string, repoId: string) { return runExtraction(this.container, this.repo, workspaceId, repoId); }
  async update(workspaceId: string, id: string, data: { rule?: string; category?: string; status?: 'pending' | 'accepted' | 'rejected' }) {
    const row = await this.repo.update(workspaceId, id, { ...data, ...(data.status ? { accepted: data.status === 'accepted' } : {}) });
    if (!row) throw new NotFoundError('Convention not found');
    return toCandidate(row);
  }
  async createSkill(workspaceId: string, repoId: string, name: string, description: string, editedBody?: string) {
    if (!await this.repo.repo(workspaceId, repoId)) throw new NotFoundError('Repo not found');
    const accepted = (await this.repo.listForRepo(workspaceId, repoId)).filter(c => c.status === 'accepted');
    if (!accepted.length) throw new AppError('no_accepted_rules', 'Accept at least one convention first', 409);
    return new SkillsService(this.container).create(workspaceId, { name, description, type: 'convention', source: 'extracted', body: editedBody ?? conventionSkillBody(accepted), evidenceFiles: [...new Set(accepted.map(c => c.evidencePath).filter((p): p is string => !!p))] });
  }
}
