"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BriefResponse, BriefProvenance } from "@devdigest/shared";
import type { DiffFocusTarget } from "@/components/diff-viewer";
import { s } from "./styles";

export interface PrBriefProps {
  response?: BriefResponse;
  loading: boolean;
  loadError?: Error | null;
  pending: boolean;
  generationError?: Error | null;
  headSha?: string | null;
  repoId: string;
  onRetry: () => void;
  onGenerate: () => void;
  onFocus: (target: DiffFocusTarget) => void;
  children?: React.ReactNode;
}

function InputCoverage({ provenance }: { provenance: BriefProvenance }) {
  const t = useTranslations("brief");
  return <div>
    <h3 style={s.title}>{t("inputs")}</h3>
    <ul style={s.sources}>
      {(["description", "intent", "blast", "files", "linked_issue", "specs"] as const).map((key) => {
        const source = provenance[key];
        const reasonKey = source.reason ? `reason.${source.reason}` : null;
        return <li key={key}>
          {t("inputState", { label: t(`input.${key}`), status: t(`status.${source.status}`) })}
          {source.reason && ` · ${reasonKey && t.has(reasonKey) ? t(reasonKey) : source.reason}`}
          {source.truncated && ` · ${t("truncated")}`}
          {source.total_count > source.included_count && ` · ${t("includedCount", { included: source.included_count, total: source.total_count })}`}
        </li>;
      })}
    </ul>
    {provenance.specs_included.length > 0 && <ul aria-label={t("includedSpecs")} style={s.sources}>
      {provenance.specs_included.map((spec) => <li key={spec.path}>
        <span className="mono">{spec.path}</span>{" · "}{t("specBytes", { included: spec.included_bytes, total: spec.original_bytes })}{" · "}
        <span className="mono" title={spec.digest}>{t("specDigest", { digest: spec.digest.slice(0, 12) })}</span>
      </li>)}
    </ul>}
  </div>;
}

export function PrBrief({ response, loading, loadError, pending, generationError, headSha, repoId, onRetry, onGenerate, onFocus, children }: PrBriefProps) {
  const t = useTranslations("brief");
  const brief = response?.brief;
  const stale = !!brief && (response?.stale || (!!headSha && brief.head_sha !== headSha));
  return <section aria-label={t("title")} style={s.region}>
    <div>
      <SectionLabel icon="FileText" right={<Button kind="primary" size="sm" loading={pending} disabled={loading}
        onClick={onGenerate}>{t(pending ? "generating" : brief ? "regenerate" : "generate")}</Button>}>{t("title")}</SectionLabel>
      <div style={s.panel}>
        {loading && <div role="status"><p style={s.muted}>{t("loading")}</p><Skeleton height={72} /></div>}
        {loadError && <div role="alert"><p>{t("loadError")}: {loadError.message}</p><Button kind="secondary" size="sm" onClick={onRetry}>{t("retry")}</Button></div>}
        {generationError && <p role="alert" style={{ color: "var(--crit)" }}>{t("generationError")}: {generationError.message}</p>}
        {pending && <p role="status" style={s.muted}>{t("pendingHint")}</p>}
        {brief ? <>
          {stale && <p role="status" style={s.notice}>{t("stale")}</p>}
          <h3 style={s.title}>{t("summary")}</h3>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{brief.summary}</p>
          <p style={s.muted}>{t("generatedFor", { sha: brief.head_sha.slice(0, 12) })}</p>
          <h3 style={s.title}>{t("block.risks")}</h3>
          <div style={s.risks}>{brief.risks.risks.map((risk, index) => <article key={index} style={s.risk}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: risk.severity === "high" ? "var(--crit)" : risk.severity === "medium" ? "var(--warn)" : "var(--text-muted)" }}>{t(`severity.${risk.severity}`)}</span>
              <strong>{risk.title}</strong>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>{risk.explanation}</p>
            <div style={{ display: "grid", gap: 3 }}>{risk.file_refs.map((file) => <button type="button" key={file} className="mono" style={s.reference}
              onClick={() => onFocus({ file, line: brief.review_focus.find((focus) => focus.file === file)?.line ?? 1 })}>{file}</button>)}</div>
          </article>)}</div>
          {brief.risks.risks.length === 0 && <p style={s.muted}>{t("noRisks")}</p>}
          <h3 style={{ ...s.title, marginTop: 22 }}>{t("reviewFocus")}</h3>
          {brief.review_focus.length ? <ol style={s.focus}>{brief.review_focus.map((focus, index) => <li key={index}>
            <button type="button" style={s.reference} onClick={() => onFocus(focus)}><span className="mono">{focus.file}:{focus.line}</span>{" — "}{focus.reason}</button>
          </li>)}</ol> : <p style={s.muted}>{t("noFocus")}</p>}
          <InputCoverage provenance={brief.provenance} />
        </> : !loading && <p style={s.muted}>{t("unavailableHint")}</p>}
      </div>
      <p style={s.muted}><Link href={`/repos/${repoId}/context`}>{t("manageContext")}</Link>{" · "}{t("contextHint")}</p>
    </div>
    {children}
  </section>;
}
