import type { Container } from '../../platform/container.js';
import { ContextInput } from './helpers.js';

export class ContextService {
  constructor(private readonly container: Container) {}
  list(workspaceId: string, repoId: string) { return this.container.contextRepo.list(workspaceId, repoId); }
  save(workspaceId: string, repoId: string, input: unknown) {
    return this.container.contextRepo.save(workspaceId, repoId, ContextInput.parse(input));
  }
}
