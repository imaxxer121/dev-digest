import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../messages/en/prReview.json";
import shell from "../../../../messages/en/shell.json";
import brief from "../../../../messages/en/brief.json";
import { DiffViewer } from "./DiffViewer";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingsApi } from "../findings";

afterEach(cleanup);
const files: PrFile[] = [
  { path: "README.md", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+docs" },
  { path: "src/a.ts", additions: 2, deletions: 1, patch: "@@ -10 +20,2 @@\n-old\n+new\n+next\n@@ -40 +50 @@\n context\n" },
  { path: "a.test.ts", additions: 1, deletions: 0, patch: null },
  { path: "index.ts", additions: 201, deletions: 0, patch: "@@ -1 +1 @@\n+wiring" },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+lock" },
];
const groups = ["core", "tests", "wiring", "docs", "boilerplate"].map((role, index) => ({
  role, files: [files[[1, 2, 3, 0, 4][index]!]!].map((f) => ({ ...f, finding_lines: [], pseudocode_summary: null })),
})) as SmartDiffResponse["groups"];
const findings = [
  { id: "f1", file: "src/a.ts", start_line: 20, severity: "CRITICAL" },
  { id: "f2", file: "src/a.ts", start_line: 20, severity: "WARNING" },
  { id: "f3", file: "src/a.ts", start_line: 10, severity: "INFO" },
  { id: "f4", file: "src/a.ts", start_line: 50, severity: "WARNING" },
  { id: "f5", file: "a.test.ts", start_line: 1, severity: "SUGGESTION" },
] as FindingRecord[];
const comment: PrReviewComment = { id: 1, path: "src/a.ts", line: 20, original_line: 20, side: "RIGHT", body: "Human comment", user: "reviewer", created_at: "2026-10-12T12:00:00Z", html_url: "https://github.com/example/pr", in_reply_to_id: null, is_outdated: false };
function view(show = true, grouped = true, onSubmit = vi.fn().mockResolvedValue({})) {
  const commenting: DiffCommentApi = { comments: [comment], canComment: true, showComments: show, posting: false, onSubmit };
  const reviewing: DiffFindingsApi = { findings, showComments: show, renderFinding: (f) => <div data-testid={f.id}>{f.id}</div> };
  return <NextIntlClientProvider locale="en" messages={{ prReview, shell, brief }}><DiffViewer files={files} groups={grouped ? groups : undefined} commenting={commenting} reviewing={reviewing} /></NextIntlClientProvider>;
}

describe("Smart Diff rendering", () => {
  it("shows all five groups, default collapse and finding-bearing file counts", () => {
    const { container } = render(view());
    expect([...container.querySelectorAll("[data-diff-role]")].map((el) => el.getAttribute("data-diff-role"))).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^Boilerplate / })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^Core / })).toHaveTextContent("1 files with findings");
    expect(screen.getByRole("button", { name: "index.ts" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /^Docs / }));
    expect(screen.getByRole("button", { name: "README.md" })).toBeInTheDocument();
  });

  it("anchors once to RIGHT rows, retains off-patch and missing-patch cards, and separates metadata", () => {
    const { container } = render(view());
    const right20 = container.querySelector('[data-diff-row="RIGHT:20"]') as HTMLElement;
    expect(within(right20).getByTestId("f1")).toBeInTheDocument();
    expect(within(right20).getByTestId("f2")).toBeInTheDocument();
    expect(within(right20).getByText("Human comment")).toBeInTheDocument();
    expect(within(container.querySelector('[data-diff-row="RIGHT:50"]') as HTMLElement).getByTestId("f4")).toBeInTheDocument();
    expect(within(container.querySelector('[data-diff-file="src/a.ts"] [data-off-patch]') as HTMLElement).getByTestId("f3")).toBeInTheDocument();
    expect(screen.getAllByTestId("f3")).toHaveLength(1);
    expect(screen.getByTestId("f5")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4 review findings" })).toBeInTheDocument();
    expect(screen.getByLabelText("1 GitHub comments")).toHaveTextContent("1");
  });

  it("marks the actual RIGHT row with the highest severity stripe/right label and hides those markers", () => {
    const { container, rerender } = render(view());
    const right20 = container.querySelector('[data-diff-file="src/a.ts"] [data-diff-row="RIGHT:20"]') as HTMLElement;
    const codeRow = right20.querySelector('[data-row-severity="CRITICAL"]') as HTMLElement;
    expect(codeRow).toHaveStyle({ borderLeftWidth: "3px", borderLeftStyle: "solid", borderLeftColor: "var(--crit)" });
    expect(codeRow.lastElementChild).toHaveTextContent("blocker");
    expect(within(codeRow).getByLabelText("Review finding: blocker")).toBeInTheDocument();
    const right50 = container.querySelector('[data-diff-row="RIGHT:50"]') as HTMLElement;
    expect(within(right50).getByLabelText("Review finding: warning")).toBeInTheDocument();
    const left10 = container.querySelector('[data-diff-row="LEFT:10"]') as HTMLElement;
    expect(left10.querySelector("[data-row-severity]")).toBeNull();
    rerender(view(false));
    expect(container.querySelector("[data-row-severity]")).toBeNull();
    expect(screen.queryByLabelText("Review finding: blocker")).not.toBeInTheDocument();
  });

  it("hides both sources without changing dots/counts and posts a correctly anchored human comment", async () => {
    const submit = vi.fn().mockResolvedValue({});
    const { container, rerender } = render(view(true, true, submit));
    rerender(view(false, true, submit));
    expect(screen.queryByTestId("f1")).not.toBeInTheDocument();
    expect(screen.queryByText("Human comment")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4 review findings" })).toBeInTheDocument();
    const line = container.querySelector('[data-diff-row="RIGHT:20"]') as HTMLElement;
    fireEvent.mouseEnter(line);
    fireEvent.click(within(line).getByRole("button", { name: "Add a comment on this line" }));
    expect(screen.getByPlaceholderText(/Leave a comment/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), { target: { value: "Keep this check" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    expect(submit).toHaveBeenCalledWith({ path: "src/a.ts", line: 20, side: "RIGHT", body: "Keep this check" });
    await waitFor(() => expect(screen.queryByPlaceholderText(/Leave a comment/)).not.toBeInTheDocument());
    rerender(view(true));
    expect(screen.getByTestId("f1")).toBeInTheDocument();
  });

  it("renders exact original input sequence when grouped mode is absent", () => {
    const { container } = render(view(true, false));
    expect([...container.querySelectorAll("[data-diff-file]")].map((el) => el.getAttribute("data-diff-file"))).toEqual(files.map((f) => f.path));
  });

  it("preserves new-comment and reply drafts across grouped/original remounts", async () => {
    const submit = vi.fn().mockResolvedValue({});
    const { container, rerender } = render(view(true, false, submit));
    const line = container.querySelector('[data-diff-file="src/a.ts"] [data-diff-row="RIGHT:20"]') as HTMLElement;
    fireEvent.mouseEnter(line);
    fireEvent.click(within(line).getByRole("button", { name: "Add a comment on this line" }));
    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), { target: { value: "New draft survives" } });
    rerender(view(true, true, submit));
    expect(screen.getByPlaceholderText(/Leave a comment/)).toHaveValue("New draft survives");
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(screen.queryByPlaceholderText(/Leave a comment/)).not.toBeInTheDocument());
    expect(submit).toHaveBeenLastCalledWith({ path: "src/a.ts", line: 20, side: "RIGHT", body: "New draft survives" });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), { target: { value: "Reply draft survives" } });
    rerender(view(true, false, submit));
    expect(screen.getByPlaceholderText(/Leave a comment/)).toHaveValue("Reply draft survives");
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(screen.queryByPlaceholderText(/Leave a comment/)).not.toBeInTheDocument());
    expect(submit).toHaveBeenLastCalledWith({ path: "src/a.ts", line: 20, side: "RIGHT", body: "Reply draft survives", in_reply_to: 1 });
  });

  it("keeps the Docs group open when a typed composer moves there from Original order", () => {
    const { container, rerender } = render(view(true, false));
    const line = container.querySelector('[data-diff-file="README.md"] [data-diff-row="RIGHT:1"]') as HTMLElement;
    fireEvent.mouseEnter(line);
    fireEvent.click(within(line).getByRole("button", { name: "Add a comment on this line" }));
    fireEvent.change(screen.getByPlaceholderText(/Leave a comment/), { target: { value: "Documentation draft" } });
    rerender(view());
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText(/Leave a comment/)).toHaveValue("Documentation draft");
  });

  it("renders five empty groups for an empty PR", () => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={{ prReview, shell, brief }}><DiffViewer files={[]} groups={[]} /></NextIntlClientProvider>);
    expect(container.querySelectorAll("[data-diff-role]")).toHaveLength(5);
    expect(screen.getAllByText("0 files with findings")).toHaveLength(5);
  });
});
