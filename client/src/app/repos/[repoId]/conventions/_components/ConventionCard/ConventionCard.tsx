"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, MonoLink } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s } from "./styles";
export function ConventionCard({ c, onUpdate, pending, evidenceUrl }: { c: ConventionCandidate; pending: boolean; evidenceUrl?: string; onUpdate: (patch: Partial<Pick<ConventionCandidate, "rule" | "category" | "status">>) => Promise<unknown> }) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [category, setCategory] = React.useState(c.category);
  const [error, setError] = React.useState<string>();
  const act = async (patch: Parameters<typeof onUpdate>[0]) => { try { setError(undefined); await onUpdate(patch); setEditing(false); } catch(e) { setError((e as Error).message); } };
  const input = { width: "100%", padding: 8, background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6 };
  return <article style={s.card(c.status !== "pending")}>
    <div style={s.row}><div style={s.main}>
      <Badge color="var(--text-secondary)">{c.category} · {c.status}</Badge>
      {editing ? <div style={{display:"grid", gap:8, marginTop:12}}>
        <label>{t("card.category")}<input aria-label={t("card.category")} style={input} value={category} onChange={e => setCategory(e.target.value)} /></label>
        <label>{t("card.rule")}<textarea aria-label={t("card.rule")} style={input} rows={3} value={rule} onChange={e => setRule(e.target.value)} /></label>
        <div><Button kind="primary" size="sm" disabled={pending || !rule.trim() || !category.trim()} onClick={() => act({rule, category})}>{t("card.save")}</Button><Button kind="secondary" size="sm" onClick={() => setEditing(false)}>{t("card.cancel")}</Button></div>
      </div> : <div style={{...s.rule, marginTop:12}}>{c.rule}</div>}
      <div style={s.evidence}><div style={s.evidenceHeader}>{evidenceUrl ? <MonoLink href={evidenceUrl}>{c.evidence_path}:{c.evidence_line}</MonoLink> : <span className="mono">{c.evidence_path}:{c.evidence_line}</span>}</div><pre className="mono" style={s.snippet}>{c.evidence_snippet}</pre></div>
      <p style={s.confidenceRow}>{t("card.confidence")} · {Math.round(c.confidence * 100)}%</p>
      {error && <p role="alert">{error}</p>}
    </div><div style={s.actionCol}>
      <Button kind="primary" size="sm" disabled={pending || c.status === "accepted"} onClick={() => act({status:"accepted"})}>{t("card.accept")}</Button>
      <Button kind="secondary" size="sm" disabled={pending || c.status === "rejected"} onClick={() => act({status:"rejected"})}>{t("card.reject")}</Button>
      <Button kind="secondary" size="sm" onClick={() => { setRule(c.rule); setCategory(c.category); setEditing(true); }}>{t("card.edit")}</Button>
    </div></div>
  </article>;
}
