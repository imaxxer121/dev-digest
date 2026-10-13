import type { EvalDiffFile, Finding, EvalExpectation } from '@devdigest/shared';

export const overlaps = (a: { file: string; start_line: number; end_line: number }, b: { file: string; start_line: number; end_line: number }) =>
  a.file === b.file && a.start_line <= b.end_line && b.start_line <= a.end_line;

export function citationReason(finding: Pick<Finding, 'file' | 'start_line' | 'end_line'> | EvalExpectation, files: EvalDiffFile[]): string | null {
  if (!Number.isSafeInteger(finding.start_line) || !Number.isSafeInteger(finding.end_line) || finding.start_line <= 0 || finding.end_line < finding.start_line) return 'Range must be positive ordered integers';
  const file = files.find(file => file.path === finding.file);
  if (!file) return 'Exact file path is absent from frozen diff';
  const intersects = file.hunks.some(hunk => hunk.newLines > 0 && hunk.newStart > 0 && hunk.newLineNumbers.some(line =>
    line >= hunk.newStart && line < hunk.newStart + hunk.newLines && line >= finding.start_line && line <= finding.end_line));
  return intersects ? null : 'Range does not intersect a real new-side diff row';
}

export function strictGround(candidates: Finding[], files: EvalDiffFile[]) {
  const grounded: Finding[] = [], indices: number[] = [], rejected: { candidate_index: number; reason: string }[] = [];
  candidates.forEach((finding, candidate_index) => {
    const reason = citationReason(finding, files);
    if (reason) rejected.push({ candidate_index, reason });
    else { grounded.push(finding); indices.push(candidate_index); }
  });
  return { grounded, indices, rejected };
}
