import { z } from 'zod';
import type { EvalDiffFile } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { MAX_FILE_BYTES } from './constants.js';
import { effectiveDescription } from './digest.js';

export const unsupported = (message: string): never => { throw new AppError('eval_source_unsupported', message, 409); };
const logicalPath = (path: string) => !!path && !/^(?:\/|[A-Za-z]:)/.test(path) && !/[\\\u0000-\u001f\u007f]/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..');
const TraceSource = z.object({
  source_diff: z.string().optional(), source_head_sha: z.string().nullable().optional(),
  source_pr: z.object({ title: z.string().nullable(), description: z.string().nullable() }).optional(),
  prompt_assembly: z.object({ user: z.string(), pr_description: z.string().nullish() }),
});

/** Recover only the exact supported final wrapper; never undo delimiter escaping. */
export function historicalSource(trace: unknown) {
  const parsed = TraceSource.safeParse(trace);
  if (!parsed.success) return unsupported('Source review has no supported saved trace');
  const value = parsed.data;
  let raw = value.source_diff;
  let retrieval: 'trace-source-diff' | 'trace-diff-block' = 'trace-source-diff';
  if (raw === undefined) {
    retrieval = 'trace-diff-block';
    const open = '## Diff to review\n<untrusted source="diff">\n';
    const user = value.prompt_assembly.user;
    const start = user.indexOf(open);
    if (start < 0 || user.indexOf(open, start + open.length) >= 0 || !user.endsWith('\n</untrusted>')) return unsupported('Source diff framing is missing or ambiguous');
    if (start > 0 && user.slice(start - 2, start) !== '\n\n') return unsupported('Source diff block is not a final generated section');
    raw = user.slice(start + open.length, -'\n</untrusted>'.length);
    if (raw.includes('</untrusted>') || raw.includes('<\\/untrusted>')) return unsupported('Source diff contains escaped or ambiguous closing delimiters');
  }
  return { raw, retrieval, head: value.source_head_sha ?? null, title: value.source_pr?.title ?? null,
    description: effectiveDescription(value.source_pr ? value.source_pr.description : value.prompt_assembly.pr_description ?? null) };
}

/** Parse actual body rows and preserve every byte of each complete git file section. */
export function parseStrictDiff(raw: string): { raw: string; file: EvalDiffFile }[] {
  const rows = (raw.match(/[^\n]*(?:\n|$)/g) ?? []).filter(Boolean);
  let offset = 0;
  const lines = rows.map(row => { const start = offset; offset += row.length; return { text: row.replace(/\r?\n$/, ''), start }; });
  const starts = lines.flatMap((line, i) => line.text.startsWith('diff --git ') ? [i] : []);
  if (!starts.length || starts[0] !== 0) return unsupported('Source requires complete git diff file sections');
  const seen = new Set<string>();
  return starts.map((start, section) => {
    const end = starts[section + 1] ?? lines.length;
    const sectionLines = lines.slice(start, end).map(line => line.text);
    const oldHeader = sectionLines.findIndex(line => line.startsWith('--- '));
    const newHeader = sectionLines.findIndex(line => line.startsWith('+++ '));
    if (oldHeader < 0 || newHeader !== oldHeader + 1) return unsupported('Source file headers are unsupported');
    const before = sectionLines[oldHeader]!.slice(4), after = sectionLines[newHeader]!.slice(4);
    const path = after.startsWith('b/') ? after.slice(2) : before.startsWith('a/') && after === '/dev/null' ? before.slice(2) : '';
    if (!logicalPath(path) || (before !== '/dev/null' && !before.startsWith('a/')) || seen.has(path)) return unsupported('Source path is invalid or ambiguous');
    seen.add(path);
    const file: EvalDiffFile = { path, additions: 0, deletions: 0, hunks: [] };
    let i = newHeader + 1;
    while (i < sectionLines.length) {
      const header = sectionLines[i++]!;
      if (!header && i === sectionLines.length) break;
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(header);
      if (!match) return unsupported('Source has unsupported hunk framing');
      const [oldStart, oldLines, newStart, newLines] = [Number(match[1]), Number(match[2] ?? 1), Number(match[3]), Number(match[4] ?? 1)];
      if (![oldStart, oldLines, newStart, newLines].every(Number.isSafeInteger) || (oldLines && oldStart < 1) || (newLines && newStart < 1)) return unsupported('Source hunk ranges are invalid');
      let oldCount = 0, newCount = 0;
      const newLineNumbers: number[] = [];
      while (i < sectionLines.length && !sectionLines[i]!.startsWith('@@ ')) {
        const body = sectionLines[i++]!;
        if (body === '\\ No newline at end of file') { if (!oldCount && !newCount) return unsupported('Unexpected no-newline metadata'); continue; }
        if (!body && i === sectionLines.length) break;
        if (body.startsWith(' ')) { newLineNumbers.push(newStart + newCount++); oldCount++; }
        else if (body.startsWith('+')) { newLineNumbers.push(newStart + newCount++); file.additions++; }
        else if (body.startsWith('-')) { oldCount++; file.deletions++; }
        else return unsupported('Unsupported source hunk body row');
        if (oldCount > oldLines || newCount > newLines) return unsupported('Source body exceeds declared hunk ranges');
      }
      if (oldCount !== oldLines || newCount !== newLines) return unsupported('Source body does not match declared hunk counts');
      file.hunks.push({ file: path, oldStart, oldLines, newStart, newLines, newLineNumbers });
    }
    if (!file.hunks.length) return unsupported('Source has no supported text hunks');
    return { raw: raw.slice(lines[start]!.start, end < lines.length ? lines[end]!.start : raw.length), file };
  });
}

export function freezeFile(raw: string, path: string) {
  const section = parseStrictDiff(raw).find(part => part.file.path === path);
  if (!section) return unsupported('Finding file is absent from its exact source diff');
  if (Buffer.byteLength(section.raw, 'utf8') > MAX_FILE_BYTES) return unsupported('Source file diff exceeds 65,536 UTF-8 bytes');
  return section;
}
