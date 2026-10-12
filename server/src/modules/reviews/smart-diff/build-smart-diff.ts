import type { SmartDiff, SmartDiffGroup } from '@devdigest/shared';
import { ROLE_ORDER } from './constants.js';
import { classifyFile } from './classify-file.js';

type FileInput = { path: string; additions: number; deletions: number };
type FindingInput = { file: string; startLine: number };

/** Read-time presentation of persisted data, preserving order within roles. */
export function buildSmartDiff(files: readonly FileInput[], findings: readonly FindingInput[]): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const finding of findings) {
    if (!Number.isInteger(finding.startLine) || finding.startLine < 1) continue;
    const lines = linesByFile.get(finding.file) ?? new Set<number>();
    lines.add(finding.startLine);
    linesByFile.set(finding.file, lines);
  }
  const groups: SmartDiffGroup[] = ROLE_ORDER.map((role) => ({ role, files: [] }));
  const byRole = new Map(groups.map((group) => [group.role, group]));
  for (const file of files) {
    byRole.get(classifyFile(file.path))!.files.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      pseudocode_summary: null,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    });
  }
  return {
    groups,
    split_suggestion: {
      too_big: false,
      total_lines: files.reduce((sum, file) => sum + file.additions + file.deletions, 0),
      proposed_splits: [],
    },
  };
}
