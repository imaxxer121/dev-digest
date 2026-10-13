import { createServer, type RequestListener, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchOllamaLoopback } from './ollama-http.js';

describe('bounded CI loopback transport', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  });
  const call = (timeout: number) => fetchOllamaLoopback('http://127.0.0.1:11434/api/chat', {
    method: 'POST', body: '{}', signal: AbortSignal.timeout(timeout),
  });
  const listen = async (handler: RequestListener) => {
    server = createServer(handler);
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(11434, '127.0.0.1', resolve);
    });
  };
  it('accepts delayed headers and preserves an error status for the provider', async () => {
    await listen((_req, res) => { setTimeout(() => { res.writeHead(503); res.end('{"error":"fixture"}'); }, 20); });
    const response = await call(1000);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'fixture' });
  });
  it('aborts when the server never sends headers', async () => {
    await listen(() => {});
    await expect(call(40)).rejects.toThrow();
  });
  it('aborts a response that sends headers but never completes its body', async () => {
    await listen((_req, res) => { res.writeHead(200); res.write('{'); });
    await expect(call(40)).rejects.toThrow();
  });
  it('rejects responses larger than the bounded buffer', async () => {
    await listen((_req, res) => { res.end('x'.repeat(1_048_577)); });
    await expect(call(1000)).rejects.toThrow('1 MiB');
  });
  it('refuses another host before opening a connection', async () => {
    await expect(fetchOllamaLoopback('https://example.com/api/chat', { method: 'POST', body: '{}' })).rejects.toThrow('fixed loopback');
  });
});
