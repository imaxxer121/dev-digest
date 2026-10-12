import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { mapBlastRadius } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

describe('cached blast mapping', () => {
  const input: BlastResult = {
    changedSymbols: [{ name: 'shared', file: 'lib/a.ts', kind: 'function' }, { name: 'shared', file: 'lib/b.ts', kind: 'function' }, { name: 'unused', file: 'lib/a.ts', kind: 'function' }],
    callers: [
      { symbol: 'handler', file: 'routes/a.ts', line: 10, rank: 2, viaSymbol: 'shared', viaFile: 'lib/a.ts' },
      { symbol: 'handler', file: 'routes/a.ts', line: 10, rank: 2, viaSymbol: 'shared', viaFile: 'lib/a.ts' },
      { symbol: 'job', file: 'jobs/b.ts', line: 5, rank: 1, viaSymbol: 'shared', viaFile: 'lib/b.ts' },
      { symbol: 'self', file: 'lib/a.ts', line: 1, rank: 3, viaSymbol: 'shared', viaFile: 'lib/a.ts' },
    ],
    impactedEndpoints: ['GET /unattributed'],
    factsByFile: { 'routes/a.ts': { endpoints: ['GET /a', 'GET /a'], crons: [] }, 'jobs/b.ts': { endpoints: [], crons: ['nightly'] } },
    degraded: true, reason: 'index_partial', indexedSha: 'abcdef',
  };
  it('groups by declaration identity and attributes only matching callers’ facts', () => {
    const result = BlastRadius.parse(mapBlastRadius(input));
    expect(result.downstream.map(d => d.callers.map(c => c.file))).toEqual([['routes/a.ts'], ['jobs/b.ts'], []]);
    expect(result.downstream[0]!.endpoints_affected).toEqual(['GET /a']);
    expect(result.downstream[1]!.crons_affected).toEqual(['nightly']);
    expect(result.counts).toEqual({ symbols: 3, callers: 2, endpoints: 1, crons: 1 });
    expect(result).toMatchObject({ degraded: true, reason: 'index_partial', indexed_sha: 'abcdef' });
    expect(result.summary).toContain('2 callers');
  });
  it('does not invent attribution for ambiguous legacy viaSymbol names', () => {
    const result = mapBlastRadius({ ...input, callers: input.callers.map(({ viaFile, ...rest }) => rest) });
    expect(result.counts!.callers).toBe(0);
  });
  it('empty full index and unavailable index stay distinct', () => {
    expect(mapBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [] }).degraded).toBe(false);
    expect(mapBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'flag_off' })).toMatchObject({ degraded: true, reason: 'flag_off', indexed_sha: null });
  });
  it('counts shared caller locations and endpoints once across changed symbols', () => {
    const result = mapBlastRadius({ changedSymbols: [
      { name: 'a', file: 'lib.ts', kind: 'function' }, { name: 'b', file: 'lib.ts', kind: 'function' },
    ], callers: ['a', 'b'].map(viaSymbol => ({ viaSymbol, viaFile: 'lib.ts', file: 'routes.ts', symbol: 'handler', line: 9, rank: 1 })),
    impactedEndpoints: [], factsByFile: { 'routes.ts': { endpoints: ['GET /shared'], crons: ['nightly'] } } });
    expect(result.downstream).toHaveLength(2);
    expect(result.counts).toEqual({ symbols: 2, callers: 1, endpoints: 1, crons: 1 });
  });
});
