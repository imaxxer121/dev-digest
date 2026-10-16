import { randomUUID } from 'node:crypto';
import type { Intent } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { IntentResponse, PrIntentRecord } from '../../vendor/shared/contracts/review-api.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { IntentOutput, prepareIntentInput, limitIntentToMetadata } from './input.js';

export interface PreparedIntent {
  intent: Intent | undefined;
  status: 'cached' | 'classified' | 'degraded';
  record: PrIntentRecord | null;
  error: string | null;
}

const batches = new WeakMap<Container, Map<string, Promise<PreparedIntent>>>();

export class IntentService {
  constructor(private readonly container: Container,
    private readonly log: (event: Record<string, unknown>) => void = () => {}) {}

  async read(workspaceId: string, prId: string): Promise<IntentResponse> {
    const row = await this.container.reviewRepo.getIntent(workspaceId, prId);
    const parsed = PrIntentRecord.safeParse(row.intent);
    const intent = parsed.success ? parsed.data : null;
    if (row.intent && !intent) this.log({ event: 'intent_cache_invalid', prId });
    return { intent, current_head_sha: row.headSha,
      freshness: !intent ? 'missing' : !intent.head_sha ? 'unknown' : intent.head_sha === row.headSha ? 'current' : 'stale' };
  }

  async recalculate(workspaceId: string, prId: string, expectedHead?: string): Promise<IntentResponse> {
    // Capture proves BOTH workspace relationships before settings/provider access.
    const snapshot = await this.container.reviewRepo.captureIntent(workspaceId, prId);
    if (expectedHead !== undefined && snapshot.headSha !== expectedHead)
      throw new AppError('intent_head_changed', 'PR head changed before batch classification.', 409);
    const messages = prepareIntentInput({ title: snapshot.title, body: snapshot.body,
      files: snapshot.files.map(file => ({ path: file.path, additions: file.additions, deletions: file.deletions })) });
    const choice = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const provider = await this.container.llm(choice.provider);
    const generationId = randomUUID();
    this.log({ event: 'intent_inference_started', prId, head_sha: snapshot.headSha, generation_id: generationId,
      provider: choice.provider, model: choice.model, application_calls: 1 });
    let result;
    try {
      result = await provider.completeStructured({ model: choice.model, schema: IntentOutput, schemaName: 'Intent', messages,
        maxRetries: 0, timeoutMs: 300_000 });
      if (result.attempts !== 1) throw new Error('Intent requires one structured attempt');
      // Providers are adapters; validate again even when an injected adapter omits validation.
      result = { ...result, data: IntentOutput.parse(result.data) };
    } catch (error) {
      this.log({ event: 'intent_inference_failed', prId, generation_id: generationId,
        error: error instanceof Error ? error.message : 'Intent classification failed' });
      throw new ExternalServiceError('Intent classification failed. The saved Intent was retained.');
    }
    const limited = limitIntentToMetadata(result.data, snapshot);
    const record = PrIntentRecord.parse({ pr_id: prId, intent: limited.intent,
      in_scope: limited.in_scope, out_of_scope: limited.out_of_scope,
      generation_id: generationId, head_sha: snapshot.headSha, generated_at: new Date().toISOString(),
      provider: choice.provider, model: result.model, tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: result.costUsd });
    const headSha = await this.container.reviewRepo.saveIntent(workspaceId, prId, snapshot, record);
    this.log({ event: 'intent_inference_completed', prId, generation_id: generationId, head_sha: headSha,
      provider: record.provider, model: record.model, tokens_in: record.tokens_in, tokens_out: record.tokens_out,
      cost_usd: record.cost_usd, application_calls: 1, attempts: result.attempts });
    return { intent: record, current_head_sha: headSha, freshness: 'current' };
  }

  /** Call once per batch; callers clone the plain value for each independent agent. */
  async prepareForBatch(workspaceId: string, prId: string, expectedHead?: string): Promise<PreparedIntent> {
    const saved = await this.read(workspaceId, prId); // Scoped failure must remain 404.
    if (expectedHead !== undefined && saved.current_head_sha !== expectedHead)
      return this.degraded(prId, 'PR head changed before batch Intent preparation');
    if (saved.intent && saved.freshness === 'current') return this.prepared(saved, 'cached');
    let pending = batches.get(this.container);
    if (!pending) { pending = new Map(); batches.set(this.container, pending); }
    const key = `${workspaceId}:${prId}:${expectedHead ?? ''}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const request = (async (): Promise<PreparedIntent> => {
      try { return this.prepared(await this.recalculate(workspaceId, prId, expectedHead), 'classified'); }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Intent classification failed';
        return this.degraded(prId, message);
      } finally { pending.delete(key); }
    })();
    pending.set(key, request);
    return request;
  }

  private degraded(prId: string, error: string): PreparedIntent {
    this.log({ event: 'intent_degraded', prId, error });
    // A stale/unknown saved result is retained for display, never passed as current scope.
    return { intent: undefined, record: null, status: 'degraded', error };
  }

  private prepared(response: IntentResponse, status: 'cached' | 'classified'): PreparedIntent {
    const record = response.intent!;
    return { intent: { intent: record.intent, in_scope: [...record.in_scope], out_of_scope: [...record.out_of_scope] },
      record, status, error: null };
  }
}
