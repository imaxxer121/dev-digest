import type { EvalBatchSummary, EvalMetrics } from "@/vendor/shared/contracts/eval-pipeline";

export const METRIC_KEYS: (keyof EvalMetrics)[] = ["recall", "precision", "citation_accuracy"];
export function metricValue(batch: EvalBatchSummary, key: keyof EvalMetrics) {
  return batch.status === "completed" ? batch.metrics[key] : null;
}
export function metricReason(batch: EvalBatchSummary, key: keyof EvalMetrics) {
  if (batch.status !== "completed") return "incomplete";
  if (!batch.counts) return "unavailable";
  if (key === "recall" && batch.counts.expected_positives === 0) return "noPositives";
  if (key !== "recall" && batch.counts.raw_candidates === 0) return "noPredictions";
  return "unavailable";
}
export function comparisonReason(a: EvalBatchSummary, b: EvalBatchSummary) {
  if (a.id === b.id) return "sameRun";
  if (a.status !== "completed" || b.status !== "completed") return "incomplete";
  if (a.comparison_key !== b.comparison_key) return "differentSuite";
  return null;
}
export function metricDelta(a: EvalBatchSummary, b: EvalBatchSummary, key: keyof EvalMetrics) {
  if (comparisonReason(a, b)) return null;
  const left = metricValue(a, key);
  const right = metricValue(b, key);
  return left == null || right == null ? null : (right - left) * 100;
}
export function formatMetric(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}
