import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { mapBlastRadius } from './helpers.js';

export class BlastService {
  constructor(private readonly container: Container) {}

  async forPull(workspaceId: string, prId: string) {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo || repo.workspaceId !== workspaceId) throw new NotFoundError('Pull request not found');
    const files = await this.container.reviewRepo.getPrFiles(prId);
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, files.map(f => f.path));
    return { repoId: pull.repoId, document: mapBlastRadius(result) };
  }
}
