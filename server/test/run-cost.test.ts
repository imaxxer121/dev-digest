import { describe, it, expect } from 'vitest';
import { successfulRunCosts } from '../src/modules/pulls/cost.js';

describe('PR successful-run cost totals', () => {
  it('sums all runs per PR, including real zero, without a time window', () => {
    const result = successfulRunCosts([
      { prId: 'one', costUsd: 0.01 }, { prId: 'two', costUsd: 0 },
      { prId: 'one', costUsd: 0.02 }, { prId: null, costUsd: 42 },
    ]);
    expect(result.get('one')).toBeCloseTo(0.03);
    expect(result.get('two')).toBe(0);
    expect(result.has('unreviewed')).toBe(false);
  });
  it('does not mislabel a partial price as a known total', () => {
    for (const values of [[null, 0.01], [0.01, null]]) {
      expect(successfulRunCosts(values.map((costUsd) => ({ prId: 'one', costUsd }))).get('one')).toBeNull();
    }
  });
});
