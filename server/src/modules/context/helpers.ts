import { z } from 'zod';

export const ContextInput = z.object({
  path: z.string().min(1).max(256).refine(path => !/^[A-Za-z]:|[\\\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'), 'Use a relative POSIX attachment name'),
  content: z.string().min(1).refine(content => content.trim().length > 0 && Buffer.byteLength(content, 'utf8') <= 65_536,
    'Text must be nonempty and at most 65536 UTF-8 bytes'),
}).strict();

export function dedupeSpecs(rows: { id: string; path: string; content: string }[]) {
  return [...new Map([...rows].sort((a, b) => b.id.localeCompare(a.id)).map(row => [row.path, row])).values()]
    .sort((a, b) => a.path.localeCompare(b.path)).map(row => ({ path: row.path, content: row.content,
      size: Buffer.byteLength(row.content, 'utf8'), updated_at: null }));
}
