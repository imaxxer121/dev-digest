import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client.js';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';

describe('CI composition', () => {
  const config = loadConfig({ NODE_ENV: 'test', GITHUB_API_OFFLINE: 'true' });
  it('keeps authenticated CI retrieval available while imported PR browsing is offline, and renews it after a secret change', async () => {
    const get = vi.fn().mockResolvedValueOnce('fixture-one').mockResolvedValueOnce('fixture-two');
    const container = new Container(config, {} as Db, { secrets: { get } });
    await expect(container.github()).rejects.toThrow('GitHub REST is disabled');
    const first = await container.ciGithub();
    expect(await container.ciGithub()).toBe(first);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('GITHUB_TOKEN');
    container.invalidateSecretCaches();
    expect(await container.ciGithub()).not.toBe(first);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('uses injected CI ports without requesting credentials or loading the real bundle', async () => {
    const get = vi.fn();
    const ciGithub = { retrieve: vi.fn() };
    const files = { 'index.js': 'fixture', '300.index.js': 'fixture-chunk', 'package.json': '{}' };
    const ciRunner = vi.fn(async () => files);
    const container = new Container(config, {} as Db, { secrets: { get }, ciGithub, ciRunner });
    expect(await container.ciGithub()).toBe(ciGithub);
    expect(await container.ciRunner()).toBe(files);
    expect(ciRunner).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
});
