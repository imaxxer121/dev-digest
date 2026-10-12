import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingsTab } from "./FindingsTab";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function finding(id: string, severity: Severity, confidence = 0.95): FindingRecord {
  return {
    id, severity, confidence,
    title: id,
    file: "src/example.ts",
    start_line: 1,
    end_line: 1,
    category: "bug",
    rationale: "Example finding for the filter interaction.",
    suggestion: null,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
  };
}

function review(id: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr-1",
    agent_id: id,
    run_id: id,
    agent_name: id,
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 70,
    model: "test-model",
    created_at: "2026-10-12T10:00:00Z",
    findings,
  };
}

const RUNS = [
  review("Security reviewer", [finding("Missing access check", "CRITICAL"), finding("Uncertain warning", "WARNING", 0.4)]),
  review("General reviewer", [finding("Unchecked input", "CRITICAL"), finding("Simplify condition", "SUGGESTION")]),
];

function renderFindings(runs = RUNS) {
  type Props = React.ComponentProps<typeof FindingsTab>;
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr-1"
        runs={runs}
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn() } as unknown as Props["cancelMutation"]}
        onOpenTrace={vi.fn()}
        onDelete={vi.fn()}
        onRunDone={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("per-run severity filters", () => {
  it("filters only the selected run, preserves the other run, and makes no requests", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderFindings();
    fireEvent.click(screen.getByRole("button", { name: /General reviewer/ }));
    const groups = screen.getAllByRole("group", { name: "Filter findings by severity" });
    fireEvent.click(within(groups[0]!).getByRole("button", { name: "Warning" }));
    expect(screen.queryByText("Missing access check")).not.toBeInTheDocument();
    expect(screen.getByText("Uncertain warning")).toBeInTheDocument();
    expect(screen.getByText("Unchecked input")).toBeInTheDocument();
    expect(screen.getByText("Simplify condition")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("restores the run by clicking its selected filter again", () => {
    renderFindings();
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(screen.queryByText("Uncertain warning")).not.toBeInTheDocument();
    expect(screen.queryByText("1 WARNING")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(screen.getByText("Uncertain warning")).toBeInTheDocument();
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
  });

  it("shows the empty state for an absent level and resets by repeat-click", () => {
    renderFindings([RUNS[0]!]);
    fireEvent.click(screen.getByRole("button", { name: "Suggestion" }));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.queryByText("1 CRITICAL")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suggestion" }));
    expect(screen.getByText("Missing access check")).toBeInTheDocument();
  });

  it("keeps a PR with no runs empty", () => {
    renderFindings([]);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
  });

  it("counts only rendered cards after confidence filtering", () => {
    renderFindings();
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Uncertain warning")).not.toBeInTheDocument();
    expect(screen.queryByText("1 WARNING")).not.toBeInTheDocument();
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
  });
});
