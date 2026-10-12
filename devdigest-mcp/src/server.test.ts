import { describe, it, expect, vi } from 'vitest';
import { apiBase, getBlastRadius } from './server.js';

const id = '00000000-0000-4000-8000-000000000001';
describe('get_blast_radius HTTP boundary', () => {
  it('forwards the exact route response with one read and no transformation', async () => {
    const data = { changed_symbols: [], downstream: [], summary: 'empty', degraded: true, reason: 'index_partial', indexed_sha: 'abc' };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
    const result = await getBlastRadius(id, 'http://127.0.0.1:3001', fetcher);
    expect(JSON.parse(result.content[0]!.text)).toEqual(data);
    expect(result.structuredContent).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(`http://127.0.0.1:3001/pulls/${id}/blast`);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'GET', redirect: 'error' });
  });
  it('rejects invalid IDs before fetching', async () => {
    const fetcher = vi.fn();
    await expect(getBlastRadius('../settings', 'http://127.0.0.1:3001', fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('gives actionable unknown-PR and unavailable-API errors without leaking response bodies', async () => {
    const missing = await getBlastRadius(id, 'http://localhost:3001', vi.fn().mockResolvedValue(new Response('private', { status: 404 })));
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toContain('local DevDigest UUID');
    expect(missing.content[0]!.text).not.toContain('private');
    const unavailable = await getBlastRadius(id, 'http://localhost:3001', vi.fn().mockRejectedValue(new Error('secret')));
    expect(unavailable.isError).toBe(true);
    expect(unavailable.content[0]!.text).not.toContain('secret');
  });
  it('validates operator configuration', () => {
    expect(apiBase('http://localhost:3001/')).toBe('http://localhost:3001');
    for (const bad of ['file:///tmp/a', 'http://u:p@localhost', 'https://example.test/?key=secret']) {
      expect(() => apiBase(bad)).toThrow();
    }
  });
  it('rejects invalid JSON and invalid documents with a useful API-version error', async () => {
    for (const body of ['<html>offline</html>', '{}', 'null', '[]']) {
      const result = await getBlastRadius(id, 'http://localhost:3001', vi.fn().mockResolvedValue(new Response(body)));
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('invalid Blast Radius');
      expect(result.structuredContent).toBeUndefined();
    }
  });
});
