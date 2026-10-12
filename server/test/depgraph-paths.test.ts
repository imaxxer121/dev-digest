import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

describe('persistent import graph paths', () => {
  it('matches POSIX indexed paths on Windows too, including TS ESM .js imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devdigest-graph-'));
    try {
      await writeFile(join(root, 'shared.ts'), 'export function shared() { return 1; }');
      await writeFile(join(root, 'route.ts'), "import { shared } from './shared.js'; export function handler() { return shared(); }");
      await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' } }));
      const edges = await new DepCruiseGraph().buildEdges(root, ['shared.ts', 'route.ts']);
      expect(edges).toContainEqual({ from: 'route.ts', to: 'shared.ts' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
