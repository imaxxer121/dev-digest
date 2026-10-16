import { constants } from 'node:fs';
import { lstat, realpath, open, opendir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, parse, sep } from 'node:path';
import { AttachedDocument, type ProjectContextDiscovery } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { CONTEXT_LIMITS, DEFAULT_CONTEXT_ROOTS, type ContextEstimator, type ProjectContextFiles } from '../../modules/project-context/ports.js';

const EXCLUDED = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'target', '.next', '.git', '.cache', 'out']);
const contained = (root: string, target: string) => { const rel = relative(root, target); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };
export const fallbackEstimator: ContextEstimator = { count: text => Math.ceil(Array.from(text).length / 4), method: 'ceil(Unicode code points / 4)' };

/** No recursive readdir or unbounded readFile: every walk/read is bounded. */
export class LocalProjectContextFiles implements ProjectContextFiles {
  private roots: Set<string>;
  constructor(roots: readonly string[] = DEFAULT_CONTEXT_ROOTS, private estimator = fallbackEstimator,
    private limits = CONTEXT_LIMITS) {
    if (!roots.length || roots.some(root => !/^[A-Za-z0-9_-]+$/.test(root) || EXCLUDED.has(root))) throw new ValidationError('Invalid Project Context root names');
    this.roots = new Set(roots);
  }
  accepts(path: string): boolean {
    if (!AttachedDocument.shape.path.safeParse(path).success) return false;
    const parts = path.split('/');
    return parts.slice(0, -1).some(part => this.roots.has(part)) && !parts.slice(0, -1).some(part => EXCLUDED.has(part) || part.startsWith('.'));
  }
  private async root(cloneRoot: string | null): Promise<string> {
    if (!cloneRoot || !isAbsolute(cloneRoot)) throw new ValidationError('Repository clone unavailable');
    const root = resolve(cloneRoot);
    // Reject linked clone roots AND linked ancestors (Windows junctions are symbolic links to lstat).
    let current = root;
    while (true) {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ValidationError('Unsafe repository clone ancestor');
      if (current === parse(current).root) break;
      current = dirname(current);
    }
    if (relative(root, await realpath(root)) !== '') throw new ValidationError('Unsafe repository clone');
    return root;
  }
  private async checked(root: string, path: string): Promise<string> {
    if (!this.accepts(path)) throw new ValidationError('Unsafe or out-of-root markdown path');
    let target = root;
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      target = resolve(target, parts[i]!);
      const stat = await lstat(target);
      if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new ValidationError('Unsafe document or ancestor');
      if (!contained(root, await realpath(target))) throw new ValidationError('Document outside repository clone');
    }
    // Refuse OS aliases (case-folded names, Windows short names/trailing dots)
    // so repository-qualified identity is also the on-disk canonical identity.
    if (relative(root, await realpath(target)).split(sep).join('/') !== path) throw new ValidationError('Noncanonical document path');
    return target;
  }
  private async checkedDirectory(root: string, path: string): Promise<string> {
    let directory = root;
    for (const part of path ? path.split('/') : []) {
      if (!part || part === '.' || part === '..' || /[\\:\x00-\x1f\x7f]/.test(part)) throw new ValidationError('Unsafe directory path');
      directory = resolve(directory, part);
      const stat = await lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory() || !contained(root, await realpath(directory))) throw new ValidationError('Unsafe directory ancestor');
    }
    return directory;
  }
  async read(cloneRoot: string | null, path: string) {
    const root = await this.root(cloneRoot);
    const target = await this.checked(root, path);
    const before = await lstat(target);
    if (before.size > this.limits.documentBytes) throw new ValidationError('Document exceeds 65536 byte limit');
    // O_NOFOLLOW is an additional final-component defense on platforms supporting it.
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > this.limits.documentBytes || stat.ino !== before.ino || stat.dev !== before.dev) throw new ValidationError('Document changed or exceeds byte limit');
      await this.checked(root, path);
      const buffer = Buffer.alloc(this.limits.documentBytes + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const read = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (!read.bytesRead) break;
        bytes += read.bytesRead;
      }
      if (bytes > this.limits.documentBytes) throw new ValidationError('Document exceeds 65536 byte limit');
      // Check ancestors after read as well; never return a replaced-link snapshot.
      await this.root(cloneRoot); await this.checked(root, path);
      const after = await lstat(target);
      if (after.ino !== stat.ino || after.dev !== stat.dev) throw new ValidationError('Document changed during read');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes));
      return { path, kind: path.split('/').find(part => this.roots.has(part))!, bytes,
        estimated_tokens: this.estimator.count(content), estimate_method: this.estimator.method, content };
    } finally { await handle.close(); }
  }
  async discover(cloneRoot: string | null): Promise<ProjectContextDiscovery> {
    const result: ProjectContextDiscovery = { documents: [], summary: { state: 'available', document_count: 0, total_estimated_tokens: 0,
      refreshed_at: new Date().toISOString(), limits: { documents: this.limits.documents, document_bytes: this.limits.documentBytes, scanned_entries: this.limits.entries, depth: this.limits.depth }, reasons: [] } };
    let root: string;
    try { root = await this.root(cloneRoot); } catch { result.summary.state = 'unavailable'; result.summary.reasons.push('Repository clone missing or unsafe'); return result; }
    let entries = 0, stop = false;
    const limited = (reason: string) => { result.summary.state = 'limited'; if (!result.summary.reasons.includes(reason)) result.summary.reasons.push(reason); };
    const walk = async (directory: string, rel: string, depth: number): Promise<void> => {
      if (stop) return;
      if (depth > this.limits.depth) { limited('Directory depth limit reached'); return; }
      try {
        await this.checkedDirectory(root, rel);
        const stat = await lstat(directory);
        if (stat.isSymbolicLink() || !stat.isDirectory() || !contained(root, await realpath(directory))) { limited('Unsafe directory skipped'); return; }
        const dir = await opendir(directory);
        for await (const entry of dir) {
          if (stop) break;
          if (++entries > this.limits.entries) { limited('Scan entry limit reached'); stop = true; break; }
          const path = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isSymbolicLink()) { limited('Linked entry skipped'); continue; }
          if (entry.isDirectory()) {
            if (!EXCLUDED.has(entry.name) && !entry.name.startsWith('.')) await walk(resolve(directory, entry.name), path, depth + 1);
          } else if (entry.isFile() && this.accepts(path)) {
            if (result.documents.length >= this.limits.documents) { limited('Document scan limit reached'); stop = true; break; }
            try { const { content: _, ...doc } = await this.read(root, path); result.documents.push(doc); }
            catch { limited('Unreadable, unsafe, oversized or invalid UTF-8 document skipped'); }
          }
        }
      } catch { limited('Unreadable directory skipped'); }
    };
    await walk(root, '', 0);
    result.documents.sort((a, b) => a.path.localeCompare(b.path));
    result.summary.document_count = result.documents.length;
    result.summary.total_estimated_tokens = result.documents.reduce((sum, doc) => sum + doc.estimated_tokens, 0);
    return result;
  }
}
