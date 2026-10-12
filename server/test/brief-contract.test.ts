import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { PrBrief, BriefResponse } from '@devdigest/shared';

describe('Brief wire contract', () => {
  it('keeps client/server vendored source identical', async () => {
    expect(await readFile(new URL('../src/vendor/shared/contracts/brief.ts', import.meta.url), 'utf8'))
      .toBe(await readFile(new URL('../../client/src/vendor/shared/contracts/brief.ts', import.meta.url), 'utf8'));
  });
  it('requires new cache shape, while absence of cache is a valid read response', () => {
    expect(PrBrief.safeParse({ intent: null, blast: null, risks: { risks: [] }, history: { history: [] } }).success).toBe(false);
    expect(BriefResponse.parse({ brief: null, current_head_sha: 'abc', stale: false }).brief).toBeNull();
  });
});
