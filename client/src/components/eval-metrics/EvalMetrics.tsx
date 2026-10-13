"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalBatchSummary } from "@/vendor/shared/contracts/eval-pipeline";
import { METRIC_KEYS, formatMetric, metricDelta, metricReason, metricValue } from "./helpers";

export function EvalMetrics({ batch, previous }: { batch: EvalBatchSummary; previous?: EvalBatchSummary }) {
  const t = useTranslations("eval.pipeline");
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
    {METRIC_KEYS.map((key) => {
      const value = metricValue(batch, key);
      const delta = previous ? metricDelta(previous, batch, key) : null;
      return <div key={key} aria-label={t(`metrics.${key}`)} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-surface)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 7 }}>{t(`metrics.${key}`)}</div>
        <strong className="tnum" style={{ fontSize: 25, color: "var(--text-primary)" }}>{formatMetric(value)}</strong>
        {value == null && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>{t(`metricReason.${metricReason(batch, key)}`)}</p>}
        {delta != null && <div data-metric-delta={key} style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>{t("delta", { points: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` })}</div>}
      </div>;
    })}
  </div>;
}
