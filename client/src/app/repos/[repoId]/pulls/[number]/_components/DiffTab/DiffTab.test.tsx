import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import brief from "../../../../../../../../messages/en/brief.json";
import { api } from "@/lib/api";
import { DiffTab, latestReview } from "./DiffTab";

vi.mock("@/lib/api", () => ({ API_BASE: "http://test", api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ notify: { error: vi.fn() } }));
afterEach(cleanup);
const f: FindingRecord = { id: "f1", file: "src/api.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Validate the request", rationale: "**Reject** invalid input before persistence.", suggestion: "Call `parse()` before saving.", confidence: 0.96, kind: "finding", trifecta_components: null, evidence: null, review_id: "r1", accepted_at: null, dismissed_at: null };
function review(id: string, created: string, findings: FindingRecord[], kind: "review" | "summary" = "review"): ReviewRecord {
  return { id, pr_id: "p1", agent_id: null, run_id: null, kind, verdict: "request_changes", summary: null, score: null, model: null, created_at: created, findings };
}
const file = { path: "src/api.ts", additions: 1, deletions: 0, patch: "@@ -1 +2 @@\n+save(input)\n" };
const smart: SmartDiffResponse = { groups: [{ role: "core", files: [{ ...file, finding_lines: [2] }] }], split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] } };
let records: ReviewRecord[];
let failAction: boolean;
let failRead: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  records = [review("r1", "2026-10-12T01:00:00Z", [{ ...f }])];
  failAction = false;
  failRead = false;
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (failRead && path.endsWith("/smart-diff")) throw new Error("Unavailable");
    if (path.endsWith("/reviews")) return records;
    if (path.endsWith("/smart-diff")) return smart;
    if (path.endsWith("/comments")) return [];
    throw new Error(path);
  });
  vi.mocked(api.post).mockImplementation(async (path) => {
    if (failAction) throw new Error("Action was not saved");
    const updated = { ...records[0]!.findings[0]!, ...(path.endsWith("/accept") ? { accepted_at: "2026-10-12T02:00:00Z" } : { dismissed_at: "2026-10-12T02:00:00Z" }) };
    records = [{ ...records[0]!, findings: [updated] }];
    return { finding: updated };
  });
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ prReview: messages, shell, brief }}><DiffTab prId="p1" files={[file]} filesCount={1} repoFullName="owner/repo" headSha="abc123" /></NextIntlClientProvider></QueryClientProvider>);
  return client;
}

describe("Files changed latest persisted review", () => {
  it("ignores newer summaries, handles equal timestamps, and does not mutate incoming reviews", () => {
    const all = [review("a", "2026-10-12", [f]), review("summary", "2026-10-13", [], "summary"), review("b", "2026-10-12", [])];
    expect(latestReview(all)?.id).toBe("b");
    expect(all.map((r) => r.id)).toEqual(["a", "summary", "b"]);
  });

  it("renders the full existing card and saves Accept/Reject with visible persisted state", async () => {
    mount();
    expect(await screen.findByText("Validate the request")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Reject", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("parse()", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("src/api.ts:2").closest("a")).toHaveAttribute("href", "https://github.com/owner/repo/blob/abc123/src/api.ts#L2");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("accepted")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/findings/f1/accept", undefined);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("dismissed")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/findings/f1/dismiss", undefined);
    fireEvent.click(screen.getByRole("button", { name: "Hide comments (1)" }));
    expect(screen.queryByText("Validate the request")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 review findings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show comments (1)" }));
    expect(screen.getByText("dismissed")).toBeInTheDocument();
  });

  it("shows failed actions without hiding the finding", async () => {
    failAction = true;
    mount();
    await screen.findByText("Validate the request");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Action was not saved");
    expect(screen.getByText("Validate the request")).toBeInTheDocument();
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
  });

  it("toggles Original order and grouped mode without changing finding metadata", async () => {
    mount();
    await screen.findByText("Validate the request");
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Core / })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 review findings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Smart Diff · grouped by role" }));
    expect(screen.getByRole("button", { name: /^Core / })).toHaveTextContent("1 files with findings");
    expect(screen.getByText("Validate the request")).toBeInTheDocument();
  });

  it("updates inline cards/counts to a completed empty review without inheriting old findings", async () => {
    const client = mount();
    await screen.findByText("Validate the request");
    records = [review("summary", "2026-10-14", [], "summary"), review("r2", "2026-10-13", []), ...records];
    await client.invalidateQueries({ queryKey: ["reviews", "p1"] });
    expect(await screen.findByText("The latest review has no findings.")).toBeInTheDocument();
    expect(screen.queryByText("Validate the request")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /review findings/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Core / })).toHaveTextContent("0 files with findings");
  });

  it("distinguishes no review, and errors leave original files visible with Retry", async () => {
    records = [];
    mount();
    expect(await screen.findByText("No review yet. Run a review to see inline findings.")).toBeInTheDocument();
    cleanup();
    failRead = true;
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("The original diff remains available");
    expect(screen.getByRole("button", { name: "src/api.ts" })).toBeInTheDocument();
    expect(screen.queryByText("The latest review has no findings.")).not.toBeInTheDocument();
    failRead = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Core / })).toBeInTheDocument();
  });
});
