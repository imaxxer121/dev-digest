import { randomUUID } from 'node:crypto';
import { BlastRadius, BriefOutput, PrBrief, type IssueMeta, type BriefResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { mapBlastRadius } from '../blast/helpers.js';
import { prepareBriefInput, localIssueNumber } from './input.js';
import { groundBrief } from './grounding.js';
import { SCHEMA_NAME } from './constants.js';

const guards = new WeakMap<Container, Set<string>>();
export class BriefService {
  private readonly pending: Set<string>;
  constructor(private readonly container: Container, private readonly log: (event: Record<string, unknown>) => void = () => {}) {
    let guard = guards.get(container);
    if (!guard) { guard = new Set(); guards.set(container, guard); }
    this.pending = guard;
  }

  async read(workspaceId: string, prId: string): Promise<BriefResponse> {
    const row = await this.container.briefRepo.read(workspaceId, prId);
    const parsed = PrBrief.safeParse(row.json);
    if (row.json && !parsed.success) this.log({ event: 'brief_cache_invalid', prId });
    const brief = parsed.success ? parsed.data : null;
    return { brief, current_head_sha: row.headSha, stale: !!brief && brief.head_sha !== row.headSha };
  }

  async generate(workspaceId: string, prId: string): Promise<BriefResponse> {
    // Validate scope before even revealing an in-flight key.
    await this.container.briefRepo.read(workspaceId, prId);
    const key = `${workspaceId}:${prId}`;
    if (this.pending.has(key)) throw new AppError('brief_generation_in_progress', 'A brief is already being generated for this PR', 409);
    this.pending.add(key);
    const started = Date.now(), callId = randomUUID();
    try {
      const snapshot = await this.container.briefRepo.capture(workspaceId, prId);
      let blast: BlastRadius | null = null;
      try { blast = mapBlastRadius(await this.container.repoIntel.getBlastRadius(snapshot.repo.id, snapshot.files.map(f => f.path))); }
      catch { /* Cached facts may be unavailable; never rebuild or compensate with inference. */ }
      let issue: IssueMeta | null = null;
      const issueNumber = localIssueNumber(snapshot.pull.body);
      let issueStatus: 'not_linked' | 'available' | 'unavailable' = issueNumber ? 'unavailable' : 'not_linked';
      if (issueNumber) {
        try { issue = await (await this.container.github()).getIssue({ owner: snapshot.repo.owner, name: snapshot.repo.name }, issueNumber); issueStatus = 'available'; }
        catch { /* Missing issue is explicit and does not stop generation. */ }
      }
      const prepared = prepareBriefInput({ pr: snapshot.pull, intent: snapshot.intent, blast, files: snapshot.files, issue, issueStatus, specs: snapshot.specs });
      const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      const provider = await this.container.llm(choice.provider);
      this.log({ event: 'brief_inference_started', call_id: callId, prId, head_sha: snapshot.pull.headSha,
        provider: choice.provider, model: choice.model, application_calls: 1, maxRetries: 0, ...prepared.metrics, provenance: prepared.provenance });
      let result;
      try {
        result = await provider.completeStructured({ model: choice.model, schema: BriefOutput, schemaName: SCHEMA_NAME,
          messages: prepared.messages, maxRetries: 0, timeoutMs: 300_000 });
        if (result.attempts !== 1) throw new Error('Provider returned more than one structured attempt');
      } catch (error) { throw new ExternalServiceError(error instanceof Error ? error.message : 'Brief generation failed'); }
      const allowed = new Set([...snapshot.files.map(f => f.path), ...(blast?.downstream.flatMap(d => d.callers.map(c => c.file)) ?? [])]);
      let grounded;
      try { grounded = groundBrief(result.data, allowed); }
      catch { throw new ExternalServiceError('Model returned an invalid brief. Regenerate explicitly.'); }
      const document = PrBrief.parse({ version: 1, head_sha: snapshot.pull.headSha, generated_at: new Date().toISOString(),
        summary: grounded.summary, review_focus: grounded.review_focus, risks: { risks: grounded.risks },
        intent: snapshot.intent, blast, history: { history: [] }, provenance: prepared.provenance,
        generation: { call_id: callId, provider: choice.provider, model: result.model, application_calls: 1, attempts: 1,
          ...prepared.metrics, tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: result.costUsd,
          duration_ms: Date.now() - started, ...grounded.counts } });
      const head = await this.container.briefRepo.save(workspaceId, prId, snapshot.pull.headSha, document);
      this.log({ event: 'brief_inference_completed', prId, head_sha: head, ...document.generation, provenance: document.provenance });
      return { brief: document, current_head_sha: head, stale: false };
    } finally { this.pending.delete(key); }
  }
}
