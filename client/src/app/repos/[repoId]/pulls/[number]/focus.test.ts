import { describe, expect, it } from "vitest";
import { diffFocusHref, readDiffFocus } from "./focus";

describe("page-owned PR focus query", () => {
  it("sets the tab/file/line together, preserves unrelated parameters and survives URL decoding/reload", () => {
    const search = new URLSearchParams("tab=overview&trace=run-42&filter=high&filter=low");
    const target = { file: 'docs/ü [guide]".md', line: 17 };
    const href = diffFocusHref("repo-1", "23", search, target);
    const url = new URL(href, "http://test");
    expect(url.pathname).toBe("/repos/repo-1/pulls/23");
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("trace")).toBe("run-42");
    expect(url.searchParams.getAll("filter")).toEqual(["high", "low"]);
    expect(readDiffFocus(url.searchParams)).toEqual(target);
    expect(search.get("tab")).toBe("overview");
  });

  it.each(["0", "-2", "1.2", "1e2", "NaN", "9007199254740992", ""])('rejects invalid line "%s" without inventing a focus target', (line) => {
    expect(readDiffFocus(new URLSearchParams({ file: "src/file.ts", line }))).toBeNull();
  });
});
