import type { ReactNode } from "react";
import type { FindingRecord, PrFile, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import { keysForLine } from "./comments";
import type { Line } from "./helpers";

export interface DiffFindingsApi {
  findings: FindingRecord[];
  showComments: boolean;
  renderFinding: (finding: FindingRecord) => ReactNode;
}

export const ROLE_ORDER: SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** Server membership, client patch objects. Preserve incoming relative order. */
export function groupedFiles(files: PrFile[], groups: SmartDiffResponse["groups"]) {
  const roles = new Map(groups.flatMap((g) => g.files.map((f) => [f.path, g.role] as const)));
  return ROLE_ORDER.map((role) => ({
    role,
    files: files.filter((f) => (roles.get(f.path) ?? "core") === role),
  }));
}

export function findingFileCount(files: PrFile[], findings: FindingRecord[]): number {
  const paths = new Set(findings.map((f) => f.file));
  return files.filter((file) => paths.has(file.path)).length;
}

/** Findings only anchor on a real RIGHT row; even repeated hunk keys render once. */
export function partitionFindings(lines: Line[], findings: FindingRecord[]) {
  const renderedRight = new Map<string, number>();
  lines.forEach((line, index) => {
    for (const key of keysForLine(line)) {
      if (key.startsWith("RIGHT:") && !renderedRight.has(key)) renderedRight.set(key, index);
    }
  });
  const byRow = new Map<number, FindingRecord[]>();
  const outside: FindingRecord[] = [];
  for (const finding of findings) {
    const row = renderedRight.get(`RIGHT:${finding.start_line}`);
    if (row == null) outside.push(finding);
    else byRow.set(row, [...(byRow.get(row) ?? []), finding]);
  }
  return { byRow, outside };
}
