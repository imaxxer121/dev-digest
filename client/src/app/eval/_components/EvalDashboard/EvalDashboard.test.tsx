import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { api } from "@/lib/api";
import { AGENT_ID, RUN_A, RUN_B, evalBatch } from "@/test/eval-fixtures";
import { mountEval } from "@/test/eval-test-utils";
import { EvalDashboard } from "./EvalDashboard";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("Stored eval dashboard", () => {
  it("shows latest cards and linked recent batches without starting inference", async () => {
    const latest = evalBatch({ metrics: { recall: 0, precision: null, citation_accuracy: null }, counts: { expected_positives: 1, true_positives: 0, false_negatives: 1, raw_candidates: 0, grounded_candidates: 0, false_positives: 0 } });
    const older = evalBatch({ id: RUN_B, status: "partial", error: "One input failed", metrics: { recall: null, precision: null, citation_accuracy: null }, cost_usd: 0 });
    vi.mocked(api.get).mockResolvedValue({ latest: [latest], recent: [latest, older] });
    mountEval(<EvalDashboard />);
    const cards = await screen.findAllByRole("link", { name: "Security reviewer" });
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute("href", `/agents/${AGENT_ID}?tab=evals&batch=${RUN_A}`);
    expect(cards[2]).toHaveAttribute("href", `/agents/${AGENT_ID}?tab=evals&batch=${RUN_B}`);
    expect(screen.getAllByText("0.0%")).toHaveLength(2);
    expect(screen.getAllByText("No predictions: this metric has no denominator.")).toHaveLength(2);
    const row = screen.getByText("Partial").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(3);
    expect(within(row).getByText("$0.00")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/eval-dashboard");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("keeps loading/error distinct from successful emptiness and offers read-only retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Dashboard unavailable"))
      .mockResolvedValue({ latest: [], recent: [] });
    mountEval(<EvalDashboard />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading stored run history");
    expect(await screen.findByRole("alert")).toHaveTextContent("Dashboard unavailable");
    expect(screen.queryByText(/No stored eval batches yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/No stored eval batches yet/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
