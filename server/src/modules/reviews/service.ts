import type { Container } from '../../platform/container.js';
import type { FindingActionKind, RunEventKind, RunTrace, MultiAgentMember, MultiAgentReviewRecord } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto, findingRowToDto } from './helpers.js';
import { buildSmartDiff } from './smart-diff/index.js';
import { groupFindings } from './grouping.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; agentIds?: string[]; all?: boolean },
  ): Promise<AgentRow[]> {
    const ids = opts.agentIds ?? (opts.agentId ? [opts.agentId] : undefined);
    if (opts.all || ids) {
      const targets = opts.all ? await this.agents.listEnabled(workspaceId) : await Promise.all(ids!.map(id => this.agents.getById(workspaceId, id)));
      if (!targets.length || targets.length > 5 || (ids && new Set(ids).size !== ids.length))
        throw new AppError('invalid_run_selection', 'Select 1–5 distinct enabled agents', 422);
      if (targets.some(a => !a || !a.enabled)) throw new AppError('invalid_run_selection', 'Every selected agent must be enabled and belong to this workspace', 422);
      return targets as AgentRow[];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    const review = await this.repo.getReview(reviewId);
    if (!review || review.workspaceId !== workspaceId) throw new NotFoundError('Review not found');
    await this.requirePull(workspaceId, review.prId);
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    await this.requirePull(workspaceId, prId);
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    await this.requirePull(workspaceId, prId);
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    await this.requireRun(workspaceId, runId);
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(workspaceId: string, runId: string): Promise<void> {
    const run = await this.requireRun(workspaceId, runId);
    if (run.status !== 'running') return;
    // Compare-and-set is serialized with atomic outcome persistence. If the
    // review already committed, this request cannot undo a completed result.
    if (!(await this.repo.cancelRunIfRunning(runId))) return;
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.complete(runId);
    // complete() releases the bus cancellation flag. Keep the checkpoint
    // signal until the background executor acknowledges cancellation itself.
    this.container.runBus.cancel(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ group_id: string; runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.requirePull(workspaceId, prId);
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo || repo.workspaceId !== workspaceId) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const { groupId, selected: runs } = await this.repo.createGroup(workspaceId, prId, targets);
    const jobs = targets.map((agent, i) => ({ agent, runId: runs[i]!.run_id }));

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { group_id: groupId, runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding; memoryId?: string }> {
    if (action === 'learn') {
      const result = await this.repo.learnFinding(workspaceId, findingId);
      if (!result) throw new NotFoundError('Finding not found');
      return { finding: findingRowToDto(result.finding), memoryId: result.memoryId };
    }
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    await this.requirePull(workspaceId, prId);
    const rows = await this.repo.reviewsForPull(workspaceId, prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async smartDiffForPull(workspaceId: string, prId: string) {
    await this.requirePull(workspaceId, prId);
    const [files, latest] = await Promise.all([
      this.repo.getPrFiles(prId),
      this.repo.latestReviewForPull(workspaceId, prId),
    ]);
    return buildSmartDiff(files, latest?.findings ?? []);
  }

  async getRunTrace(workspaceId: string, runId: string): Promise<RunTrace | undefined> {
    await this.requireRun(workspaceId, runId);
    return this.repo.getRunTrace(runId);
  }

  async requirePull(workspaceId: string, prId: string) {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull || (await this.repo.getRepo(pull.repoId))?.workspaceId !== workspaceId) throw new NotFoundError('Pull request not found');
    return pull;
  }

  async requireRun(workspaceId: string, runId: string) {
    const run = await this.repo.getScopedRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Run not found');
    return run;
  }

  async multiAgentReviews(workspaceId: string, prId: string): Promise<{ groups: MultiAgentReviewRecord[] }> {
    await this.requirePull(workspaceId, prId);
    const [{ groups, runs }, reviews] = await Promise.all([this.repo.groupsForPull(workspaceId, prId), this.reviewsForPull(workspaceId, prId)]);
    return { groups: groups.map(group => {
      const members: MultiAgentMember[] = group.selectedRuns.map(selected => {
        const run = runs.find(r => r.id === selected.run_id && (r.agentId === selected.agent_id || r.agentId === null) && r.groupId === group.id);
        const review = reviews.find(r => r.run_id === selected.run_id && (r.agent_id === selected.agent_id || r.agent_id === null)) ?? null;
        return { ...selected, status: run ? (['done', 'failed', 'cancelled'].includes(run.status ?? '') ? run.status as 'done' | 'failed' | 'cancelled' : 'running') : 'deleted',
          error: run?.error ?? null, duration_ms: run?.durationMs ?? null, cost_usd: run?.costUsd ?? null,
          tokens_in: run?.tokensIn ?? null, tokens_out: run?.tokensOut ?? null, review };
      });
      return { id: group.id, pr_id: group.prId, ran_at: group.ranAt.toISOString(), members, groups: groupFindings(members) };
    }) };
  }
}
