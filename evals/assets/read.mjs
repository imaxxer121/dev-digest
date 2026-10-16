// Immutable, staged helper. A successful command plus digest can be scored as a read.
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
const path = process.argv[2];
if (!path || /[\\:\x00-\x1f\x7f]/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Canonical relative path required');
const root = process.cwd(); let target = root;
for (const part of path.split('/')) { target = resolve(target, part); if ((await lstat(target)).isSymbolicLink()) throw new Error('Linked file refused'); }
const rel = relative(root, await realpath(target));
if (rel === '..' || rel.startsWith(`..${sep}`) || (await lstat(target)).size > 131072) throw new Error('Unsafe or oversized read');
const bytes = await readFile(target); if (bytes.length > 131072) throw new Error('Read limit');
console.log('HARNESS_READ ' + JSON.stringify({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }));
process.stdout.write(bytes);
