import { describe, it, expect, vi } from 'vitest';
import { RepoIntelService, downstreamFiles } from '../src/modules/repo-intel/service.js';
import { MAX_CALLERS_PER_SYMBOL, BFS_DEPTH } from '../src/modules/repo-intel/constants.js';

function fixture(status = 'full', flag = true) {
  const forbidden = vi.fn(() => { throw new Error('must not parse or infer'); });
  const service = new RepoIntelService({ config: { repoIntelEnabled: flag }, db: {},
    codeIndex: { symbols: forbidden, references: forbidden }, git: forbidden, llm: forbidden } as never);
  const repo = {
    tryGetIndexState: vi.fn(async () => ({ status, lastIndexedSha: 'cached-sha', degradedReason: 'repo_too_large' })),
    getSymbolRows: vi.fn(async (_id: string, files: string[]) => files.includes('lib/a.ts') ? [
      { path: 'lib/a.ts', name: 'a', kind: 'function' }, { path: 'lib/a.ts', name: 'b', kind: 'function' },
    ] : files.map(path => ({ path, name: 'handler', line: 1, endLine: 100 }))),
    getResolvedCallers: vi.fn(async () => ['a', 'b'].flatMap(toSymbol => [
      { fromPath: 'lib/a.ts', toSymbol, declFile: 'lib/a.ts', line: 1, rank: 99 },
      ...Array.from({ length: 25 }, (_, i) => ({ fromPath: `caller/${i}.ts`, toSymbol, declFile: 'lib/a.ts', line: 10, rank: 25 - i })),
    ])),
    getEdges: vi.fn(async () => [{ fromFile: 'routes.ts', toFile: 'caller/0.ts' }, { fromFile: 'third.ts', toFile: 'routes.ts' }]),
    getFileFacts: vi.fn(async (id: string, files: string[]) => files.filter(file => file === 'routes.ts').map(filePath => ({ filePath, endpoints: ['GET /real'], crons: ['daily'] }))),
  };
  (service as unknown as { repo: unknown }).repo = repo;
  return { service, repo, forbidden };
}
describe('cache-only blast facade', () => {
  it('retains top 20 for each symbol, excludes self, and reads cached endpoint impact up to depth 2', async () => {
    const { service, repo, forbidden } = fixture();
    const result = await service.getBlastRadius('r', ['lib/a.ts']);
    for (const name of ['a', 'b']) expect(result.callers.filter(c => c.viaSymbol === name)).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(result.callers.every(c => c.file !== 'lib/a.ts')).toBe(true);
    expect(result.factsByFile!['caller/0.ts']).toEqual({ endpoints: ['GET /real'], crons: ['daily'] });
    expect(repo.getFileFacts.mock.calls[0]![1]).not.toContain('third.ts');
    expect(result).toMatchObject({ degraded: false, indexedSha: 'cached-sha' });
    expect(forbidden).not.toHaveBeenCalled();
    expect(repo.tryGetIndexState).toHaveBeenCalledTimes(1);
  });
  it('preserves partial data and a reason, including when no symbols match', async () => {
    const { service, repo } = fixture('partial');
    expect(await service.getBlastRadius('r', ['lib/a.ts'])).toMatchObject({ degraded: true, reason: 'index_partial' });
    repo.getSymbolRows.mockResolvedValue([]);
    expect(await service.getBlastRadius('r', ['docs.md'])).toMatchObject({ degraded: true, reason: 'index_partial', callers: [] });
  });
  it('flag off, missing, failed and read failure never reach parsing', async () => {
    const off = fixture('full', false);
    expect(await off.service.getBlastRadius('r', ['a.ts'])).toMatchObject({ reason: 'flag_off' });
    expect(off.repo.tryGetIndexState).not.toHaveBeenCalled();
    const failed = fixture('failed');
    expect(await failed.service.getBlastRadius('r', ['a.ts'])).toMatchObject({ reason: 'repo_too_large' });
    const missing = fixture(); missing.repo.tryGetIndexState.mockResolvedValue(null as never);
    expect(await missing.service.getBlastRadius('r', ['a.ts'])).toMatchObject({ reason: 'no_data' });
    const broken = fixture(); broken.repo.getSymbolRows.mockRejectedValue(new Error('DB failure'));
    expect(await broken.service.getBlastRadius('r', ['a.ts'])).toMatchObject({ reason: 'index_failed' });
    for (const item of [off, failed, missing, broken]) expect(item.forbidden).not.toHaveBeenCalled();
  });
  it('traverses reverse import edges, bounds depth and stops cycles', () => {
    const edges = [{ fromFile: 'b', toFile: 'a' }, { fromFile: 'c', toFile: 'b' }, { fromFile: 'd', toFile: 'c' }, { fromFile: 'a', toFile: 'b' }, { fromFile: 'a', toFile: 'dependency' }];
    expect([...downstreamFiles('a', edges, BFS_DEPTH)]).toEqual(['a', 'b', 'c']);
  });
  it('does not name a top-level use after a function as that function', async () => {
    const { service, repo } = fixture();
    repo.getResolvedCallers.mockResolvedValue([
      { fromPath: 'caller.ts', toSymbol: 'a', declFile: 'lib/a.ts', line: 2, rank: 1 },
      { fromPath: 'caller.ts', toSymbol: 'a', declFile: 'lib/a.ts', line: 5, rank: 1 },
    ]);
    repo.getSymbolRows.mockImplementation(async (_id, files) => files.includes('lib/a.ts')
      ? [{ path: 'lib/a.ts', name: 'a', kind: 'function' }] as never
      : [{ path: 'caller.ts', name: 'done', line: 1, endLine: 3 }] as never);
    const result = await service.getBlastRadius('r', ['lib/a.ts']);
    expect(result.callers.map(c => c.symbol)).toEqual(['done', 'caller.ts']);
  });
});
