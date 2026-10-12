import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("PR severity filter", () => {
  it("counts findings across runs and opens only matching findings without requests", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderFindings();
    expect(screen.getByRole("button", { name: "All (4)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 WARNING" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 SUGGESTION" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2 CRITICAL" }));
    expect(screen.getByText("Missing access check")).toBeInTheDocument();
    expect(screen.getByText("Unchecked input")).toBeInTheDocument();
    expect(screen.queryByText("Uncertain warning")).not.toBeInTheDocument();
    expect(screen.queryByText("Simplify condition")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 CRITICAL" })).toHaveAttribute("aria-pressed", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("switches severity and restores all findings by clicking the active filter", () => {
    renderFindings();
    fireEvent.click(screen.getByRole("button", { name: "1 SUGGESTION" }));
    expect(screen.getByText("Simplify condition")).toBeInTheDocument();
    expect(screen.queryByText("Missing access check")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 WARNING" }));
    expect(screen.getByText("Uncertain warning")).toBeInTheDocument();
    expect(screen.queryByText("Simplify condition")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 WARNING" }));
    expect(screen.getByRole("button", { name: "All (4)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Missing access check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /General reviewer/ })).toBeInTheDocument();
  });

  it("handles an empty level and lets All restore the list", () => {
    renderFindings([RUNS[0]!]);
    fireEvent.click(screen.getByRole("button", { name: "0 SUGGESTION" }));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.queryByText("Missing access check")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All (2)" }));
    expect(screen.getByText("Missing access check")).toBeInTheDocument();
  });

  it("shows zero counters for a PR with no findings", () => {
    renderFindings([]);
    expect(screen.getByRole("button", { name: "All (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 CRITICAL" })).toBeInTheDocument();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
  });

  it("keeps severity totals when the confidence toggle hides a matching finding", () => {
    renderFindings();
    fireEvent.click(screen.getByRole("button", { name: "1 WARNING" }));
    expect(screen.getByText("Uncertain warning")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Uncertain warning")).not.toBeInTheDocument();
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 WARNING" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Uncertain warning")).toBeInTheDocument();
  });
});
