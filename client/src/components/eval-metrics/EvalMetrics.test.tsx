import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { evalBatch, RUN_B } from "@/test/eval-fixtures";
import { mountEval } from "@/test/eval-test-utils";
import { EvalMetrics } from "./EvalMetrics";
import { comparisonReason, metricDelta } from "./helpers";

afterEach(cleanup);
describe("Stored eval metrics", () => {
  it("preserves real zero and explains zero denominators instead of assigning a score", () => {
    const batch = evalBatch({ metrics: { recall: 0, precision: null, citation_accuracy: null }, counts: { expected_positives: 1, true_positives: 0, false_negatives: 1, raw_candidates: 0, grounded_candidates: 0, false_positives: 0 } });
    mountEval(<EvalMetrics batch={batch} />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getAllByText("No predictions: this metric has no denominator.")).toHaveLength(2);
    cleanup();
    mountEval(<EvalMetrics batch={evalBatch({ metrics: { recall: null, precision: 0, citation_accuracy: 0 }, counts: { ...batch.counts!, expected_positives: 0, raw_candidates: 1 } })} />);
    expect(screen.getByText("No must-find expectations: recall has no denominator.")).toBeInTheDocument();
  });

  it("suppresses incomplete scores and incomparable deltas while allowing configuration changes", () => {
    const a = evalBatch();
    const b = evalBatch({ id: RUN_B, config_digest: "b".repeat(64), metrics: { recall: 0.5, precision: 1, citation_accuracy: null } });
    const { container } = mountEval(<EvalMetrics batch={b} previous={a} />);
    expect(screen.getByText("-50.0 percentage points vs run A")).toBeInTheDocument();
    expect(screen.getByText("+50.0 percentage points vs run A")).toBeInTheDocument();
    expect(container.querySelector('[data-metric-delta="citation_accuracy"]')).toBeNull();
    expect(comparisonReason(a, { ...b, comparison_key: "c".repeat(64) })).toBe("differentSuite");
    expect(metricDelta(a, { ...b, comparison_key: "c".repeat(64) }, "recall")).toBeNull();
    cleanup();
    const incomplete = mountEval(<EvalMetrics batch={{ ...b, status: "partial" }} previous={a} />);
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getAllByText("A complete successful batch is required.")).toHaveLength(3);
    expect(incomplete.container.querySelector("[data-metric-delta]")).toBeNull();
    expect(comparisonReason(a, a)).toBe("sameRun");
  });
});
