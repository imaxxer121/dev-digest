import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Db } from '../src/db/client.js';
import { createDb } from '../src/db/client.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * No-I/O route smoke tests via app.inject(). Startup recovery receives only
 * this isolated fake DB; creating a real client is forbidden even if .env
 * supplies a reachable live DATABASE_URL. DB routes use Testcontainers.
 */
vi.mock('../src/db/client.js', () => ({ createDb: vi.fn(() => { throw new Error('Route smoke tests must never create a database client'); }) }));
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://isolated:isolated@127.0.0.1:1/never-connect' });
function isolatedDb(): Db {
  return {
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
    update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) })),
    execute: vi.fn(async () => { throw new Error('Unexpected smoke database execution'); }),
  } as unknown as Db;
}

describe('routes (no DB)', () => {
  beforeEach(() => { vi.mocked(createDb).mockClear(); });
  it('rejects an omitted test DB before client creation or startup recovery', async () => {
    await expect(buildApp({ config })).rejects.toThrow('Tests must inject an isolated database');
    expect(createDb).not.toHaveBeenCalled();
  });

  it('GET /health → ok', async () => {
    const app = await buildApp({ config, db: isolatedDb() });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(createDb).not.toHaveBeenCalled();
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      db: isolatedDb(),
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    expect(createDb).not.toHaveBeenCalled();
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      db: isolatedDb(),
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    expect(createDb).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config, db: isolatedDb() });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(createDb).not.toHaveBeenCalled();
    await app.close();
  });
});
