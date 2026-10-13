"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { EvalMetrics } from "@/components/eval-metrics";
import { formatMetric, metricValue } from "@/components/eval-metrics/helpers";
import { formatCost } from "@/lib/cost";
import { s } from "./styles";

export function EvalDashboard() {
  const t = useTranslations("eval.pipeline");
  const query = useEvalDashboard();
  return <div style={s.wrap}>
    <h1 style={s.title}>{t("dashboard")}</h1><p style={s.subtle}>{t("dashboardDescription")}</p><p style={s.subtle}>{t("limitation")}</p>
    {query.isLoading && <p role="status">{t("loadingHistory")}</p>}
    {query.isError && <div role="alert"><p style={s.error}>{query.error instanceof Error ? query.error.message : t("loadError")}</p><Button kind="secondary" size="sm" onClick={() => void query.refetch()}>{t("retry")}</Button></div>}
    {query.data && <>
      {query.data.latest.length === 0 && <p>{t("noDashboardRuns")}</p>}
      <div style={s.cards}>{query.data.latest.map((batch) => <article key={batch.agent_id} style={s.card}>
        <Link href={`/agents/${batch.agent_id}?tab=evals&batch=${batch.id}`} style={s.agent}>{batch.agent_name}</Link>
        <p style={s.subtle}>{batch.provider}/{batch.model} · v{batch.agent_version} · {t(`status.${batch.status}`)}</p>
        <p style={s.subtle}>{batch.started_at} · {t("passCount", { passed: batch.cases_passed, total: batch.cases_total })}</p>
        <EvalMetrics batch={batch} />
        <p style={s.subtle}>{t("progress", { succeeded: batch.groups_succeeded, failed: batch.groups_failed, total: batch.groups_total })}</p>
        {batch.error && <p role="alert" style={s.error}>{batch.error}</p>}
      </article>)}</div>
      <h2 style={s.title}>{t("recent")}</h2>
      <div style={s.tableWrap}><table style={s.table}><thead><tr>{["agent", "started", "statusLabel", "metrics.recall", "metrics.precision", "metrics.citation_accuracy", "passed", "cost"].map((key) => <th key={key} style={s.cell}>{t(key)}</th>)}</tr></thead><tbody>
        {query.data.recent.map((batch) => <tr key={batch.id}>
          <td style={s.cell}><Link href={`/agents/${batch.agent_id}?tab=evals&batch=${batch.id}`}>{batch.agent_name}</Link></td>
          <td style={s.cell}>{batch.started_at}</td><td style={s.cell}>{t(`status.${batch.status}`)}</td>
          {(["recall", "precision", "citation_accuracy"] as const).map((key) => <td key={key} style={s.cell}>{formatMetric(metricValue(batch, key))}</td>)}
          <td style={s.cell}>{batch.cases_passed}/{batch.cases_total}</td><td style={s.cell}>{formatCost(batch.cost_usd)}</td>
        </tr>)}
      </tbody></table></div>
    </>}
  </div>;
}
