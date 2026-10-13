"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalBatchDetail } from "@/vendor/shared/contracts/eval-pipeline";
import { EvalMetrics } from "@/components/eval-metrics";
import { formatCost } from "@/lib/cost";
import { s } from "./styles";

export function BatchSnapshot({ batch, previous }: { batch: EvalBatchDetail; previous?: EvalBatchDetail }) {
  const t = useTranslations("eval.pipeline");
  return <article style={s.panel} aria-label={t("snapshot", { id: batch.id })}>
    <strong>{batch.started_at} · {t(`status.${batch.status}`)}</strong>
    <p style={s.subtle}>{batch.id} · {batch.provider}/{batch.model} · v{batch.agent_version}</p>
    <p style={s.subtle}>{t("progress", { succeeded: batch.groups_succeeded, failed: batch.groups_failed, total: batch.groups_total })} · {t("passCount", { passed: batch.cases_passed, total: batch.cases_total })}</p>
    {batch.error && <p role="alert" style={s.error}>{batch.error}</p>}
    <EvalMetrics batch={batch} previous={previous} />
    <p style={s.subtle}>{t("durationCost", { ms: batch.duration_ms ?? "—", cost: formatCost(batch.cost_usd) })}</p>
    {batch.counts && <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 5, fontSize: 12, margin: 0 }}>
      {Object.entries(batch.counts).map(([key, value]) => <React.Fragment key={key}><dt>{t(`counts.${key}`)}</dt><dd style={{ margin: 0 }}>{value}</dd></React.Fragment>)}
    </dl>}
    <p style={s.subtle}>{t("profile")} · {batch.snapshot.profile.id} · {batch.snapshot.profile.context} · {batch.snapshot.profile.strategy}</p>
    <p style={s.subtle}>{t("dataset")} · {batch.dataset_digest}</p>
    <p style={s.subtle}>{t("configuration")} · {batch.config_digest}</p>
    <p style={s.subtle}>{t("comparisonKey")} · {batch.comparison_key}</p>
    <h3 style={s.title}>{t("storedPrompt")}</h3>
    <pre style={s.pre}>{batch.snapshot.agent.system_prompt}</pre>
    <h3 style={s.title}>{t("storedSkills")}</h3>
    {batch.snapshot.skills.length === 0 && <p style={s.subtle}>{t("noSkills")}</p>}
    {batch.snapshot.skills.map((skill) => <details key={skill.id}>
      <summary>{skill.name} · v{skill.version} · {t(skill.enabled ? "enabled" : "disabled")} · {t("skillOrder", { order: skill.order })}</summary>
      <p style={s.subtle}>{skill.id} · {skill.digest}</p><pre style={s.pre}>{skill.body}</pre>
    </details>)}
    <details><summary>{t("fullSnapshot")}</summary><pre style={s.pre}>{JSON.stringify(batch.snapshot, null, 2)}</pre></details>
    <details><summary>{t("groupResults", { count: batch.groups.length })}</summary><div style={s.list}>
      {batch.groups.map((group) => <section key={group.input_digest} style={s.panel}>
        <strong>{t(`groupStatus.${group.status}`)}</strong><p style={s.subtle}>{group.input_digest}</p>
        {group.error && <p role="alert" style={s.error}>{group.error}</p>}
        <p style={s.subtle}>{t("groupUsage", { calls: group.structured_calls, attempts: group.structured_attempts ?? "—", input: group.tokens_in ?? "—", output: group.tokens_out ?? "—", cost: formatCost(group.cost_usd) })}</p>
        <pre style={s.pre}>{JSON.stringify(group, null, 2)}</pre>
      </section>)}
    </div></details>
  </article>;
}
