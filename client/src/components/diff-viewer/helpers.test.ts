import { describe, expect, it } from "vitest";
import { parsePatch } from "./helpers";
import { partitionFindings, groupedFiles, findingFileCount } from "./findings";
import type { FindingRecord, PrFile, SmartDiffResponse } from "@devdigest/shared";

function finding(id: string, file: string, line: number) {
  return { id, file, start_line: line } as FindingRecord;
}
const files: PrFile[] = ["README.md", "src/a.ts", "a.test.ts", "index.ts", "pnpm-lock.yaml", "src/b.ts"].map((path) => ({ path, additions: 1, deletions: 0 }));
const groups: SmartDiffResponse["groups"] = [
  { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
  { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
  { role: "tests", files: [{ path: "a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
  { role: "wiring", files: [{ path: "index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
];

describe("trusted unified diff anchors", () => {
  it("skips metadata and CRLF/trailing empty text without consuming line numbers", () => {
    const lines = parsePatch("diff --git a/a b/a\r\n--- a/a\r\n+++ b/a\r\n@@ -10,2 +20,3 @@\r\n-old\r\n+new\r\n\\ No newline at end of file\r\n \r\n+\r\n");
    expect(lines).toEqual([
      { kind: "hunk", text: "@@ -10,2 +20,3 @@" },
      { kind: "del", oldNo: 10, text: "old" },
      { kind: "add", newNo: 20, text: "new" },
      { kind: "ctx", oldNo: 11, newNo: 21, text: "" },
      { kind: "add", newNo: 22, text: "" },
    ]);
  });

  it("anchors start_line on real RIGHT rows across hunks and keeps unmatched cards once", () => {
    const lines = parsePatch("@@ -10 +20 @@\n-old\n+new\n@@ -40 +50 @@\n context\n");
    const findings = [finding("left", "a", 10), finding("a", "a", 20), finding("b", "a", 20), finding("c", "a", 50), finding("outside", "a", 99)];
    const { byRow, outside } = partitionFindings(lines, findings);
    expect(byRow.get(2)?.map((f) => f.id)).toEqual(["a", "b"]);
    expect(byRow.get(4)?.map((f) => f.id)).toEqual(["c"]);
    expect(outside.map((f) => f.id)).toEqual(["left", "outside"]);
    expect(partitionFindings([], findings).outside).toEqual(findings);
  });
});

describe("server groups without losing original patches", () => {
  it("keeps fixed five-role display order and input order within each role", () => {
    const result = groupedFiles(files, groups);
    expect(result.map((g) => g.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(result[0]?.files).toEqual([files[1], files[5]]);
    expect(files.map((f) => f.path)).toEqual(["README.md", "src/a.ts", "a.test.ts", "index.ts", "pnpm-lock.yaml", "src/b.ts"]);
    expect(result[3]?.files[0]).toBe(files[0]);
    expect(groupedFiles([], []).every((g) => g.files.length === 0)).toBe(true);
  });
  it("counts files with findings rather than finding objects or lines", () => {
    expect(findingFileCount(files, [finding("a", "src/a.ts", 1), finding("b", "src/a.ts", 1), finding("c", "src/b.ts", 2)])).toBe(2);
  });
});
