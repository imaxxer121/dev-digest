import { Review, type EvalBatchDetail } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { GROUP_TIMEOUT_MS } from './constants.js';
import { groupPrompt, summarize } from './snapshot.js';
import { scoreGroup } from './scorer.js';

export class EvalExecutor {
  constructor(private readonly container: Container) {}
  async execute(workspaceId: string, detail: EvalBatchDetail) {
    for (const group of detail.groups) {
      const input = detail.snapshot.groups.find(input => input.input_digest === group.input_digest)!;
      const start = Date.now();
      group.status = 'running';
      await this.container.evalsRepo.save(workspaceId, summarize(detail));
      try {
        const prompt = groupPrompt(detail.snapshot.agent, detail.snapshot.skills, input);
        group.prompt_assembly = prompt.assembly;
        const provider = await this.container.llm(detail.snapshot.agent.provider);
        group.structured_calls = 1;
        const result = await provider.completeStructured({ model: detail.snapshot.agent.model, schema: Review, schemaName: 'Review', messages: prompt.messages,
          maxRetries: 0, timeoutMs: GROUP_TIMEOUT_MS });
        group.structured_attempts = result.attempts;
        group.raw_output = result.raw; group.tokens_in = result.tokensIn; group.tokens_out = result.tokensOut; group.cost_usd = result.costUsd;
        const review = Review.parse(result.data);
        group.candidates = review.findings;
        if (result.attempts !== 1) throw new Error('Eval requires exactly one structured attempt');
        const scored = scoreGroup(detail.snapshot.cases.filter(item => input.case_ids.includes(item.id)), review.findings, input.input_files);
        group.grounded = scored.grounded; group.rejected = scored.rejected; group.case_results = scored.case_results;
        group.counts = scored.counts; group.metrics = scored.metrics; group.status = 'completed';
      } catch (error) {
        group.status = 'failed'; group.error = error instanceof Error ? error.message : 'Eval group failed';
      }
      group.duration_ms = Date.now() - start;
      detail = summarize(detail);
      await this.container.evalsRepo.save(workspaceId, detail);
    }
    await this.container.evalsRepo.save(workspaceId, summarize(detail, true));
  }
}
