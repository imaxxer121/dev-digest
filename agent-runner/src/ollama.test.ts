import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OllamaProvider } from './ollama.js';
describe('CI-only Ollama structured adapter', () => {
  const schema = z.object({ answer: z.string() });
  const request = { schema, schemaName: 'Answer', model: 'qwen2.5-coder:7b-instruct', messages: [{ role: 'user' as const, content: 'fixture' }] };
  it('requests loopback schema-format output and reports actual usage with unknown price', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({ done: true, message: { content: '{"answer":"fixture"}' }, prompt_eval_count: 7, eval_count: 4 })));
    const result = await new OllamaProvider(fetcher).completeStructured({ ...request, messages: [{ role: 'user', content: 'x'.repeat(13000) }] });
    expect(result).toMatchObject({ data: { answer: 'fixture' }, tokensIn: 7, tokensOut: 4, costUsd: null, attempts: 1 });
    expect(fetcher.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ stream: false, format: { type: 'object' }, options: { temperature: 0, num_ctx: 32768, num_predict: 2048 } });
  });
  it.each([
    { done: false, message: { content: '{"answer":"x"}' }, prompt_eval_count: 1, eval_count: 2 },
    { done: true, message: { content: '{"answer":"x"}' } },
    { done: true, message: { content: '{"answer":1}' }, prompt_eval_count: 1, eval_count: 2 },
  ])('rejects incomplete, unaccounted or invalid output %#', async body => {
    await expect(new OllamaProvider(async () => new Response(JSON.stringify(body))).completeStructured(request)).rejects.toThrow();
  });
  it('rejects oversized input before inference rather than silently truncate', async () => {
    const fetcher = vi.fn();
    await expect(new OllamaProvider(fetcher).completeStructured({ ...request, messages: [{ role: 'user', content: 'x'.repeat(25000) }] })).rejects.toThrow('context budget');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
