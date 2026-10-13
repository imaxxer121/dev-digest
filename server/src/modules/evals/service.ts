import type { Container } from '../../platform/container.js';
import { EvalExecutor } from './executor.js';

export class EvalsService {
  constructor(private readonly container: Container, private readonly onError: (error: unknown) => void = () => {}) {}
  convert(workspaceId: string, findingId: string, notes?: string) { return this.container.evalsRepo.convert(workspaceId, findingId, notes); }
  cases(workspaceId: string, agentId: string) { return this.container.evalsRepo.listCases(workspaceId, agentId); }
  history(workspaceId: string, agentId: string) { return this.container.evalsRepo.history(workspaceId, agentId); }
  detail(workspaceId: string, batchId: string) { return this.container.evalsRepo.read(workspaceId, batchId); }
  dashboard(workspaceId: string) { return this.container.evalsRepo.dashboard(workspaceId); }
  async start(workspaceId: string, agentId: string) {
    const detail = await this.container.evalsRepo.start(workspaceId, agentId);
    void new EvalExecutor(this.container).execute(workspaceId, detail).catch(async error => {
      this.onError(error);
      await this.container.evalsRepo.interrupt(workspaceId, detail.id, error instanceof Error ? error.message : 'Eval execution failed').catch(this.onError);
    });
    return { batch_id: detail.id, status: 'running' as const };
  }
}
