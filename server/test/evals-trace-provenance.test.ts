import { describe, expect, it, vi } from 'vitest';
import type { RunTrace } from '@devdigest/shared';
import type { Container } from '../src/platform/container.js';
import type { AgentRow, PullRow } from '../src/db/rows.js';
import type * as t from '../src/db/schema.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { historicalSource } from '../src/modules/evals/source.js';
import { DIFF, FILE } from './helpers/evals.js';

describe('future eval source head provenance', () => {
  it('retains actual newer GitHub fallback diff without certifying the stale queued PR head', async () => {
    const git = new MockGitClient({ diff: '' });
    const patch = DIFF.slice(DIFF.indexOf('@@ '));
    const github = new MockGitHubClient({ detail: { head_sha: 'H1', files: [{ path: FILE, additions: 2, deletions: 1, patch }] } });
    const getPullRequest = vi.spyOn(github, 'getPullRequest');
    const provider = new MockLLMProvider('anthropic', { structured: { verdict: 'approve', summary: 'Fixture', score: 95, findings: [] } });
    let trace: RunTrace | undefined;
    const repository = {
      getIntent: vi.fn(async () => ({ headSha: 'H0', intent: { pr_id: 'pull-id', intent: 'Cached fixture purpose',
        in_scope: [], out_of_scope: [], head_sha: 'H0' } })),
      getPrFiles: vi.fn(async () => []), persistOutcome: vi.fn(async (_review, _findings, _stats, _head, value: RunTrace) => { trace = value; return { review: { id: 'review-id' }, findings: [] }; }),
      markReviewed: vi.fn(async () => {}), completeAgentRun: vi.fn(async () => {}),
      saveRunTrace: vi.fn(async (_id: string, value: RunTrace) => { trace = value; }),
    } as unknown as ReviewRepository;
    const agents = { linkedSkills: vi.fn(async () => []) } as unknown as Container['agentsRepo'];
    const projectContext = {
      resolveForAgent: vi.fn(async () => ({ specs: [], trace: { reads: [], skipped: [], estimated_tokens: 0,
        estimate_method: 'fixture empty block', bytes: 0, token_limit: 8000, document_byte_limit: 65536 } })),
      measureBlock: vi.fn(() => ({ estimated_tokens: 0, estimate_method: 'fixture empty block', bytes: 0 })),
    };
    const container = { git, github: async () => github, llm: async () => provider, runBus: new RunBus(), agentsRepo: agents,
      reviewRepo: repository, projectContext } as unknown as Container;
    const pull = { id: 'pull-id', repoId: 'repo-id', number: 1, title: 'Queued title', body: 'Saved model-visible description', base: 'main', headSha: 'H0' } as PullRow;
    const agent = { id: 'agent-id', workspaceId: 'workspace-id', name: 'Fixture', provider: 'anthropic', model: 'fixture', systemPrompt: 'Review', version: 1,
      strategy: 'single-pass', repoIntel: false, ciFailOn: 'critical' } as AgentRow;
    const repo = { id: 'repo-id', owner: 'fixture', name: 'repo' } as typeof t.repos.$inferSelect;
    await new ReviewRunExecutor(container, repository, agents).executeRuns('workspace-id', pull, repo, [{ agent, runId: 'run-id' }]);
    expect(getPullRequest).toHaveBeenCalledTimes(1);
    expect(repository.persistOutcome).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-id' }), [], expect.any(Object), 'H0', expect.any(Object));
    expect(trace).toBeDefined(); expect(trace!.source_head_sha).toBeNull(); expect(trace!.source_diff).toContain(patch);
    const frozen = historicalSource(trace); expect(frozen.head).toBeNull(); expect(frozen.raw).toBe(trace!.source_diff);
    expect(frozen).toMatchObject({ title: 'Queued title', description: 'Saved model-visible description', retrieval: 'trace-source-diff' });
    expect(provider.calls.filter(call => call.method === 'completeStructured')).toHaveLength(1);
  });
});
