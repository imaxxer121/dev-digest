import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { toJsonSchema } from '@devdigest/reviewer-core';
import { fetchOllamaLoopback } from './ollama-http.js';

/** CI-only loopback inference. Credentials and PR code never enter this adapter. */
export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama' as const;
  constructor(private fetchImpl: typeof fetch = fetchOllamaLoopback) {}
  async listModels() { return []; }
  async complete(): Promise<never> { throw new Error('CI Ollama supports structured review only'); }
  async embed(): Promise<never> { throw new Error('CI Ollama does not embed'); }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const schema = toJsonSchema(req.schema, req.schemaName).schema;
    if (Buffer.byteLength(JSON.stringify({ messages: req.messages, schema }), 'utf8') > 24_000) throw new Error('CI Ollama input exceeds its conservative 24,000-byte context budget; use a smaller PR or OpenRouter');
    const response = await this.fetchImpl('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(req.timeoutMs ?? 900_000),
      body: JSON.stringify({ model: req.model, messages: req.messages, stream: false,
        format: schema,
        options: { temperature: 0, num_ctx: 32768, num_predict: Math.min(req.maxTokens ?? 2048, 2048) } }),
    });
    if (!response.ok) throw new Error(`Ollama inference failed (${response.status})`);
    const body = await response.json() as { message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number };
    const raw = body.message?.content;
    if (!body.done || typeof raw !== 'string' || !Number.isInteger(body.prompt_eval_count) || !Number.isInteger(body.eval_count)) throw new Error('Ollama returned incomplete output or unavailable token accounting');
    return { data: req.schema.parse(JSON.parse(raw)), raw, model: req.model, tokensIn: body.prompt_eval_count!, tokensOut: body.eval_count!, costUsd: null, attempts: 1 };
  }
}
