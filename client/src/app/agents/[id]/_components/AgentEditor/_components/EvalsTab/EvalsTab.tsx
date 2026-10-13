"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useAgentEvalCases, useAgentEvalRuns, useEvalBatch, useRunAgentEvals } from "@/lib/hooks/evals";
import { EvalMetrics } from "@/components/eval-metrics";
import { comparisonReason, formatMetric, metricValue } from "@/components/eval-metrics/helpers";
import type { EvalBatchSummary } from "@/vendor/shared/contracts/eval-pipeline";
import { BatchSnapshot } from "./BatchSnapshot";
import { s } from "./styles";

export function EvalsTab({ agentId, requestedBatchId }: { agentId: string; requestedBatchId?: string | null }) {
  const t = useTranslations("eval.pipeline");
  const cases = useAgentEvalCases(agentId);
  const history = useAgentEvalRuns(agentId);
  const start = useRunAgentEvals();
  const [selectedId, setSelectedId] = React.useState<string | null>(requestedBatchId ?? null);
  const [leftId, setLeftId] = React.useState("");
  const [rightId, setRightId] = React.useState("");
  React.useEffect(() => { if (requestedBatchId) setSelectedId(requestedBatchId); }, [requestedBatchId]);
  const batch = useEvalBatch(selectedId);
  const startedBatch = useEvalBatch(start.data?.batch_id);
  const left = useEvalBatch(leftId || null);
  const right = useEvalBatch(rightId || null);
  const records = history.data ?? [];
  const running = records.some((entry) => entry.status === "running") || batch.data?.status === "running"
    || (!!start.data && (!startedBatch.data || startedBatch.data.status === "running"));
  const suite = cases.data?.cases ?? [];
  const unsupported = cases.data?.unsupported ?? [];
  const latest = records[0];
  const compareReason = left.data && right.data ? comparisonReason(left.data, right.data) : null;
  const runLabel = (entry: EvalBatchSummary) => `${entry.started_at} · v${entry.agent_version} · ${entry.model} · ${t(`status.${entry.status}`)} · ${entry.id}`;
  const detailError = (message: string, retry: () => void) => <div role="alert"><p style={s.error}>{message}</p><Button kind="ghost" size="sm" onClick={retry}>{t("retry")}</Button></div>;
  return <div style={s.wrap}>
    <div style={s.header}><h2 style={s.title}>{t("title")}</h2><a href="/eval">{t("dashboard")}</a></div>
    <p style={s.subtle}>{t("limitation")}</p>
    {latest && <EvalMetrics batch={latest} />}
    <section style={s.panel}>
      <div style={s.header}><h2 style={s.title}>{t("casesTitle", { count: suite.length })}</h2>
        <Button kind="primary" size="sm" icon="Play" loading={start.isPending} disabled={cases.isLoading || cases.isError || suite.length === 0 || unsupported.length > 0 || !!running || start.isPending}
          onClick={() => start.mutate({ agentId }, { onSuccess: (result) => setSelectedId(result.batch_id) })}>{t(start.isPending || running ? "running" : "runAll")}</Button>
      </div>
      {cases.isLoading && <p role="status">{t("loadingCases")}</p>}
      {cases.isError && detailError(cases.error instanceof Error ? cases.error.message : t("loadError"), () => void cases.refetch())}
      {start.isError && <p role="alert" style={s.error}>{start.error instanceof Error ? start.error.message : t("runError")}</p>}
      {unsupported.length > 0 && <div role="alert" style={s.warning}><strong>{t("unsupported")}</strong>{unsupported.map((item) => <p key={item.id}>{item.name} · {item.reason}</p>)}</div>}
      {!cases.isLoading && !cases.isError && suite.length === 0 && <p style={s.subtle}>{t("emptyCases")}</p>}
      {suite.length > 0 && <p style={s.subtle}>{t("caseKinds", { positive: suite.filter((item) => item.expected_output.kind === "must_find").length, negative: suite.filter((item) => item.expected_output.kind === "must_not_flag").length })}</p>}
      <div style={s.list}>{suite.map((item) => <details key={item.id} style={s.panel}>
        <summary>{item.name} · {t(`kind.${item.expected_output.kind}`)} · {item.expected_output.file}:{item.expected_output.start_line}–{item.expected_output.end_line}</summary>
        <p style={s.subtle}>{t("source", { pr: item.input_meta.source.pr_number, decision: t(`decision.${item.input_meta.source.decision}`), date: item.input_meta.source.decision_at })}</p>
        <p style={s.subtle}>{t("immutable")}</p>
        {item.notes && <p style={s.subtle}>{t("notes")} · {item.notes}</p>}
        <h3 style={s.title}>{t("frozenDiff")}</h3><pre style={s.pre}>{item.input_diff}</pre>
        <h3 style={s.title}>{t("provenance")}</h3><pre style={s.pre}>{JSON.stringify(item.input_meta, null, 2)}</pre>
      </details>)}</div>
    </section>
    <section style={s.panel}>
      <h2 style={s.title}>{t("history")}</h2>
      {history.isLoading && <p role="status">{t("loadingHistory")}</p>}
      {history.isError && detailError(history.error instanceof Error ? history.error.message : t("loadError"), () => void history.refetch())}
      {!history.isLoading && !history.isError && records.length === 0 && <p style={s.subtle}>{t("noRuns")}</p>}
      <div style={s.tableWrap}><table style={s.table}><thead><tr>{["started", "statusLabel", "metrics.recall", "metrics.precision", "metrics.citation_accuracy", "inspect"].map((key) => <th key={key} style={s.cell}>{t(key)}</th>)}</tr></thead><tbody>
        {records.map((entry) => <tr key={entry.id}><td style={s.cell}>{entry.started_at} · v{entry.agent_version}</td><td style={s.cell}>{t(`status.${entry.status}`)}</td>
          {(["recall", "precision", "citation_accuracy"] as const).map((key) => <td key={key} style={s.cell}>{formatMetric(metricValue(entry, key))}</td>)}
          <td style={s.cell}><Button kind="ghost" size="sm" onClick={() => setSelectedId(entry.id)}>{t("inspect")}</Button></td>
        </tr>)}
      </tbody></table></div>
    </section>
    {selectedId && <section style={s.panel}><h2 style={s.title}>{t("selectedRun")}</h2>
      {batch.isLoading && <p role="status">{t("loadingRun")}</p>}
      {batch.isError && detailError(batch.error instanceof Error ? batch.error.message : t("loadError"), () => void batch.refetch())}
      {batch.data && (batch.data.agent_id === agentId ? <BatchSnapshot batch={batch.data} /> : <p role="alert" style={s.error}>{t("wrongAgent")}</p>)}
    </section>}
    <section style={s.panel}><h2 style={s.title}>{t("compare")}</h2>
      <div style={s.compare}>{([["leftRun", leftId, setLeftId], ["rightRun", rightId, setRightId]] as const).map(([key, value, set]) => <label key={key}>{t(key)}<select aria-label={t(key)} value={value} onChange={(event) => set(event.target.value)} style={s.select}>
        <option value="">{t("chooseRun")}</option>{records.map((entry) => <option key={entry.id} value={entry.id}>{runLabel(entry)}</option>)}
      </select></label>)}</div>
      {leftId && left.isLoading && <p role="status">{t("loadingRun")}</p>}
      {rightId && right.isLoading && <p role="status">{t("loadingRun")}</p>}
      {left.isError && detailError(left.error instanceof Error ? left.error.message : t("loadError"), () => void left.refetch())}
      {right.isError && detailError(right.error instanceof Error ? right.error.message : t("loadError"), () => void right.refetch())}
      {left.data && right.data && <>
        <p style={compareReason ? s.warning : s.subtle}>{t(compareReason ? `comparison.${compareReason}` : "comparison.comparable")}</p>
        <div style={s.compare}><BatchSnapshot batch={left.data} /><BatchSnapshot batch={right.data} previous={left.data} /></div>
      </>}
    </section>
  </div>;
}
