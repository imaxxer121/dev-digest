import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { LocalProjectContextFiles, fallbackEstimator } from '../src/adapters/project-context/files.js';
import { CONTEXT_LIMITS } from '../src/modules/project-context/ports.js';
import { AttachedDocuments } from '../src/vendor/shared/contracts/project-context.js';

describe('bounded Project Context filesystem port', () => {
  let root: string;
  const files = new LocalProjectContextFiles();
  async function put(path: string, content = '# Context') { const dest = join(root, path); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, content); }
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'project-context-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it('finds recursive named roots once, keeping the outermost kind and excluding arbitrary/dependency markdown', async () => {
    await put('packages/api/specs/docs/a.md', '😀'.repeat(5)); await put('other/insights/deep/b.md');
    await put('docs/root.md'); await put('README.md'); await put('src/no.md');
    await put('node_modules/docs/secret.md'); await put('docs/vendor/hidden.md'); await put('.git/docs/no.md');
    const result = await files.discover(root);
    expect(result.summary.state).toBe('available');
    expect(result.documents.map(doc => doc.path)).toEqual(['docs/root.md', 'other/insights/deep/b.md', 'packages/api/specs/docs/a.md']);
    expect(result.documents[2]).toMatchObject({ kind: 'specs', bytes: 20, estimated_tokens: 2, estimate_method: 'ceil(Unicode code points / 4)' });
  });
  it('supports central alternate names; unavailable, empty and limited scans have truthful states', async () => {
    expect((await files.discover(null)).summary.state).toBe('unavailable');
    expect((await files.discover(join(root, 'missing'))).summary.state).toBe('unavailable');
    expect((await files.discover(root)).summary).toMatchObject({ state: 'available', document_count: 0 });
    await put('nested/design/a.md'); await put('docs/b.md');
    const alternate = await new LocalProjectContextFiles(['design']).discover(root);
    expect(alternate.documents.map(doc => doc.path)).toEqual(['nested/design/a.md']);
    await put('docs/c.md');
    const limited = await new LocalProjectContextFiles(undefined, fallbackEstimator, { ...CONTEXT_LIMITS, documents: 1 }).discover(root);
    expect(limited.summary).toMatchObject({ state: 'limited', document_count: 1 });
    expect(limited.summary.reasons).toContain('Document scan limit reached');
  });
  it('rejects traversal, empty/dot paths, UNC, drive paths, backslashes, controls and wrong roots before reading', async () => {
    await put('docs/a.md');
    for (const path of ['../docs/a.md', '/docs/a.md', 'C:/docs/a.md', '//server/docs/a.md', 'docs\\a.md', './docs/a.md', 'docs//a.md', 'docs/../a.md', 'docs/./a.md', 'docs/a\0.md', 'docs/a\n.md', 'src/a.md', 'docs/a.txt']) {
      await expect(files.read(root, path)).rejects.toThrow();
    }
    expect(AttachedDocuments.safeParse(Array.from({ length: 65 }, (_, n) => ({ repo_id: '00000000-0000-4000-8000-000000000001', path: `docs/${n}.md` }))).success).toBe(false);
  });
  it('bounds bytes before allocating bodies, retains full Unicode and reads fresh after preview', async () => {
    await put('docs/a.md', 'é'.repeat(32768));
    expect((await files.read(root, 'docs/a.md')).bytes).toBe(65536);
    await put('docs/a.md', 'é'.repeat(32769));
    await expect(files.read(root, 'docs/a.md')).rejects.toThrow('byte limit');
    const listed = await files.discover(root); expect(listed.summary.state).toBe('limited'); expect(listed.documents).toEqual([]);
    await put('docs/a.md', 'new whole body'); expect((await files.read(root, 'docs/a.md')).content).toBe('new whole body');
  });
  it('rejects replaced ancestors, internal links, clone-root links and junctions at every fresh read', async () => {
    await put('docs/a.md'); await mkdir(join(root, 'safe'));
    await rename(join(root, 'docs'), join(root, 'previous'));
    // Windows junctions do not require the symbolic-link privilege. Unix uses directory symlinks.
    await symlink(join(root, 'previous'), join(root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(files.read(root, 'docs/a.md')).rejects.toThrow('Unsafe');
    expect((await files.discover(root)).documents).toEqual([]);
    await symlink(root, join(root, 'safe', 'clone'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(files.read(join(root, 'safe', 'clone'), 'docs/a.md')).rejects.toThrow('Unsafe');
  });
  it('never follows an outside junction and caps non-document directory work', async () => {
    await mkdir(join(root, 'docs')); await symlink(tmpdir(), join(root, 'docs', 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await files.discover(root); expect(result.summary.state).toBe('limited'); expect(result.documents).toEqual([]);
    await mkdir(join(root, 'a')); await mkdir(join(root, 'b'));
    expect((await new LocalProjectContextFiles(undefined, fallbackEstimator, { ...CONTEXT_LIMITS, entries: 1 }).discover(root)).summary.reasons).toContain('Scan entry limit reached');
  });
});
