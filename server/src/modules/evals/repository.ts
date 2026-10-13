import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { FrozenEvalCase, EvalAgentSnapshot, EvalSkillSnapshot, EvalBatchDetail, JsonValue, type EvalCaseCollection, type EvalCaseConversion, type EvalBatchSummary } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { historicalSource, freezeFile, unsupported } from './source.js';
import { citationReason } from './grounding.js';
import { inputDigest, textDigest } from './digest.js';
import { buildSnapshot, initialBatch, summarize, validateFrozen } from './snapshot.js';
import { emptyMetrics } from './scorer.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Connection = Db | Tx;
type CaseRow = typeof t.evalCases.$inferSelect;
type BatchRow = typeof t.evalBatches.$inferSelect;

function batchDocument(row: BatchRow, workspaceId: string) {
  const parsed = EvalBatchDetail.safeParse({ ...row.result, snapshot: row.snapshot });
  if (!parsed.success) throw new NotFoundError('Eval batch snapshot is invalid');
  const detail = parsed.data;
  if (detail.id !== row.id || detail.agent_id !== row.agentId || detail.snapshot.agent.id !== row.agentId ||
    detail.snapshot.cases.some(item => item.owner_id !== row.agentId || item.input_meta.source.agent_id !== row.agentId || item.input_meta.source.workspace_id !== workspaceId)) {
    throw new NotFoundError('Eval batch source scope is invalid');
  }
  return detail;
}

function caseDocument(row: CaseRow) {
  return FrozenEvalCase.parse({ id: row.id, owner_kind: row.ownerKind, owner_id: row.ownerId, name: row.name,
    input_diff: row.inputDiff, input_files: row.inputFiles, input_meta: row.inputMeta, expected_output: row.expectedOutput,
    notes: row.notes, created_at: row.createdAt.toISOString() });
}
function caseScope(item: FrozenEvalCase, workspaceId: string, agentId: string, sourceFindingId: string | null) {
  if (item.input_meta.source.workspace_id !== workspaceId || item.input_meta.source.agent_id !== agentId || item.owner_id !== agentId ||
    (sourceFindingId !== null && item.input_meta.source.finding_id !== sourceFindingId)) throw new NotFoundError('Eval source scope is invalid');
}
function summary(detail: EvalBatchDetail): EvalBatchSummary {
  const { snapshot: _snapshot, groups: _groups, ...summary } = detail;
  return summary;
}
function conflict(error: unknown): never {
  const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  if (code === '23505' || code === '40001') throw new AppError('eval_run_in_progress', 'Another batch or configuration change won the race; retry explicitly', 409);
  throw error;
}

export class EvalsRepository {
  constructor(private readonly db: Db) {}

  private async agent(db: Connection, workspaceId: string, id: string) {
    const [row] = await db.select().from(t.agents).where(and(eq(t.agents.id, id), eq(t.agents.workspaceId, workspaceId)));
    if (!row) throw new NotFoundError('Agent not found');
    return row;
  }

  private async cases(db: Connection, workspaceId: string, agentId: string): Promise<EvalCaseCollection> {
    const rows = await db.select().from(t.evalCases).where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    const cases: FrozenEvalCase[] = [], unsupportedRows: EvalCaseCollection['unsupported'] = [];
    for (const row of rows) {
      let item: FrozenEvalCase;
      try { item = caseDocument(row); }
      catch { unsupportedRows.push({ id: row.id, name: row.name, reason: 'Legacy case does not contain a valid immutable L06 input' }); continue; }
      caseScope(item, workspaceId, agentId, row.sourceFindingId);
      const [repo] = await db.select({ id: t.repos.id }).from(t.repos).where(and(eq(t.repos.id, item.input_meta.source.repo_id), eq(t.repos.workspaceId, workspaceId)));
      if (!repo) throw new NotFoundError('Eval source repository not found');
      try { validateFrozen(item); cases.push(item); }
      catch (error) { unsupportedRows.push({ id: row.id, name: row.name, reason: error instanceof Error ? error.message : 'Unsupported frozen input' }); }
    }
    return { cases, unsupported: unsupportedRows };
  }

  async listCases(workspaceId: string, agentId: string) {
    await this.agent(this.db, workspaceId, agentId);
    return this.cases(this.db, workspaceId, agentId);
  }

  async convert(workspaceId: string, findingId: string, notes?: string): Promise<EvalCaseConversion> {
    return this.db.transaction(async tx => {
      const [source] = await tx.select({ finding: t.findings, review: t.reviews, pull: t.pullRequests, repo: t.repos, run: t.agentRuns, agent: t.agents, trace: t.runTraces.trace })
        .from(t.findings).innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId)).innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
        .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId)).innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
        .innerJoin(t.agents, eq(t.agents.id, t.reviews.agentId)).leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
        .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId), eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId), eq(t.agentRuns.workspaceId, workspaceId), eq(t.agents.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, t.reviews.agentId), eq(t.agentRuns.prId, t.reviews.prId)))
        .for('update', { of: t.findings });
      if (!source) throw new NotFoundError('Finding source not found');
      const [existing] = await tx.select().from(t.evalCases).where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.ownerId, source.agent.id), eq(t.evalCases.sourceFindingId, findingId)));
      if (existing) {
        let item: FrozenEvalCase;
        try { item = caseDocument(existing); }
        catch { return unsupported('Existing source case does not contain a valid immutable L06 input'); }
        caseScope(item, workspaceId, source.agent.id, findingId);
        const [repo] = await tx.select({ id: t.repos.id }).from(t.repos).where(and(eq(t.repos.id, item.input_meta.source.repo_id), eq(t.repos.workspaceId, workspaceId)));
        if (!repo) throw new NotFoundError('Eval source repository not found');
        return { case: item, created: false };
      }
      const finding = source.finding;
      if (source.review.kind !== 'review' || source.run.status !== 'done' || (finding.kind !== 'finding' && finding.kind !== null)) return unsupported('Only normal findings from successful source reviews can become cases');
      if (!!finding.acceptedAt === !!finding.dismissedAt) return unsupported('Persist exactly one accepted or dismissed decision first');
      const extracted = historicalSource(source.trace);
      const fragment = freezeFile(extracted.raw, finding.file);
      const expectation = { kind: finding.acceptedAt ? 'must_find' as const : 'must_not_flag' as const, file: finding.file, start_line: finding.startLine, end_line: finding.endLine };
      const reason = citationReason(expectation, [fragment.file]);
      if (reason) return unsupported(reason);
      const document = FrozenEvalCase.parse({ id: randomUUID(), owner_kind: 'agent', owner_id: source.agent.id, name: finding.title,
        input_diff: fragment.raw, input_files: [fragment.file], expected_output: expectation, notes: notes ?? null, created_at: new Date().toISOString(),
        input_meta: { version: 1, profile: 'diff-only-v1', pr_title: extracted.title, pr_description: extracted.description,
          input_digest: inputDigest(fragment.raw, extracted.title, extracted.description), source: {
            workspace_id: workspaceId, repo_id: source.repo.id, pr_id: source.pull.id, pr_number: source.pull.number,
            review_id: source.review.id, run_id: source.run.id, finding_id: finding.id, agent_id: source.agent.id,
            decision: finding.acceptedAt ? 'accepted' : 'dismissed', decision_at: (finding.acceptedAt ?? finding.dismissedAt)!.toISOString(),
            source_head_sha: extracted.head, diff_digest: textDigest(fragment.raw), retrieval: extracted.retrieval } } });
      await tx.insert(t.evalCases).values({ id: document.id, workspaceId, ownerKind: 'agent', ownerId: source.agent.id,
        name: document.name, inputDiff: document.input_diff, inputFiles: document.input_files, inputMeta: document.input_meta,
        expectedOutput: document.expected_output, notes: document.notes, sourceFindingId: finding.id, createdAt: new Date(document.created_at) });
      return { case: document, created: true };
    });
  }

  async start(workspaceId: string, agentId: string): Promise<EvalBatchDetail> {
    try {
      return await this.db.transaction(async tx => {
        const [row] = await tx.select().from(t.agents).where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId))).for('update');
        if (!row) throw new NotFoundError('Agent not found');
        const [running] = await tx.select({ id: t.evalBatches.id }).from(t.evalBatches).where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.agentId, agentId), eq(t.evalBatches.status, 'running')));
        if (running) throw new AppError('eval_run_in_progress', 'This agent already has a running eval batch', 409);
        const collection = await this.cases(tx, workspaceId, agentId);
        if (collection.unsupported.length) throw new AppError('eval_suite_unsupported', 'Suite contains unsupported cases', 409, collection.unsupported);
        const links = await tx.select({ skill: t.skills, order: t.agentSkills.order }).from(t.agentSkills)
          .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId)).where(eq(t.agentSkills.agentId, agentId)).orderBy(asc(t.agentSkills.order), asc(t.skills.id));
        if (links.some(link => link.skill.workspaceId !== workspaceId)) throw new NotFoundError('Linked skill scope is invalid');
        const agent = EvalAgentSnapshot.parse({ id: row.id, name: row.name, version: row.version, provider: row.provider, model: row.model,
          system_prompt: row.systemPrompt, strategy: row.strategy, output_schema: row.outputSchema ?? null, repo_intel: row.repoIntel, ci_fail_on: row.ciFailOn });
        const skills = links.map(({ skill, order }) => EvalSkillSnapshot.parse({ id: skill.id, name: skill.name, order,
          version: skill.version, body: skill.body, enabled: skill.enabled, digest: textDigest(skill.body) }));
        const snapshot = buildSnapshot(agent, skills, collection.cases);
        const result = initialBatch(randomUUID(), new Date().toISOString(), snapshot);
        await tx.insert(t.evalBatches).values({ id: result.id, workspaceId, agentId, status: 'running', startedAt: new Date(result.started_at), snapshot, result });
        return result;
      }, { isolationLevel: 'repeatable read' });
    } catch (error) { return conflict(error); }
  }

  async read(workspaceId: string, batchId: string) {
    const [row] = await this.db.select().from(t.evalBatches).where(and(eq(t.evalBatches.id, batchId), eq(t.evalBatches.workspaceId, workspaceId)));
    if (!row) throw new NotFoundError('Eval batch not found');
    return batchDocument(row, workspaceId);
  }

  async history(workspaceId: string, agentId: string) {
    await this.agent(this.db, workspaceId, agentId);
    const rows = await this.db.select().from(t.evalBatches).where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.agentId, agentId)))
      .orderBy(desc(t.evalBatches.startedAt), desc(t.evalBatches.id));
    return rows.map(row => summary(batchDocument(row, workspaceId)));
  }

  async dashboard(workspaceId: string) {
    const rows = await this.db.select().from(t.evalBatches).where(eq(t.evalBatches.workspaceId, workspaceId)).orderBy(desc(t.evalBatches.startedAt), desc(t.evalBatches.id));
    const summaries = rows.map(row => summary(batchDocument(row, workspaceId)));
    const seen = new Set<string>();
    return { latest: summaries.filter(item => { if (seen.has(item.agent_id)) return false; seen.add(item.agent_id); return true; }), recent: summaries.slice(0, 20) };
  }

  /** Group progress and all member rows commit together. */
  async save(workspaceId: string, detail: EvalBatchDetail) {
    await this.db.transaction(async tx => {
      const [row] = await tx.select({ status: t.evalBatches.status }).from(t.evalBatches).where(and(eq(t.evalBatches.id, detail.id), eq(t.evalBatches.workspaceId, workspaceId))).for('update');
      if (!row || row.status !== 'running') throw new AppError('eval_batch_interrupted', 'Eval batch is no longer running', 409);
      await tx.update(t.evalBatches).set({ status: detail.status, result: EvalBatchDetail.parse(detail), completedAt: detail.completed_at ? new Date(detail.completed_at) : null, error: detail.error })
        .where(and(eq(t.evalBatches.id, detail.id), eq(t.evalBatches.workspaceId, workspaceId)));
      for (const group of detail.groups.filter(group => group.status === 'completed' || group.status === 'failed')) {
        for (const result of group.case_results) {
          await tx.insert(t.evalRuns).values({ batchId: detail.id, caseId: result.case_id, inputDigest: group.input_digest, actualOutput: group,
            pass: result.pass, recall: group.metrics.recall, precision: group.metrics.precision, citationAccuracy: group.metrics.citation_accuracy, durationMs: group.duration_ms, costUsd: group.cost_usd })
            .onConflictDoUpdate({ target: [t.evalRuns.batchId, t.evalRuns.caseId], targetWhere: sql`${t.evalRuns.batchId} IS NOT NULL`, set: {
              actualOutput: group, pass: result.pass, recall: group.metrics.recall, precision: group.metrics.precision, citationAccuracy: group.metrics.citation_accuracy,
              durationMs: group.duration_ms, costUsd: group.cost_usd } });
        }
      }
    });
  }

  async interrupt(workspaceId: string, batchId: string, error: string) {
    const detail = await this.read(workspaceId, batchId);
    if (detail.status !== 'running') return;
    detail.groups = detail.groups.map(group => group.status === 'completed' || group.status === 'failed' ? group : ({ ...group, status: 'failed', error,
      case_results: group.case_ids.map(case_id => ({ case_id, pass: null, matched_candidate_index: null })), metrics: emptyMetrics() }));
    await this.save(workspaceId, summarize(detail, true, error));
  }

  async reap() {
    const rows = await this.db.select({ id: t.evalBatches.id, workspaceId: t.evalBatches.workspaceId }).from(t.evalBatches).where(eq(t.evalBatches.status, 'running'));
    for (const row of rows) await this.interrupt(row.workspaceId, row.id, 'Interrupted by API restart; run evals explicitly again');
    return rows.length;
  }
}
