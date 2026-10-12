"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, MonoLink, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadius as BlastRadiusData, ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import { usePrBlastRadius } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

function SourceReference({ repoFullName, sha, file, line }: { repoFullName?: string | null; sha?: string | null; file: string; line?: number }) {
  const label = line == null ? file : `${file}:${line}`;
  const href = repoFullName && sha && (line == null || line > 0) ? githubBlobUrl(repoFullName, sha, file, line) : undefined;
  return href ? <MonoLink href={href}>{label}</MonoLink> : <span className="mono" style={s.source}>{label}</span>;
}

function SymbolImpact({ symbol, impact, repoFullName, sha, degraded }: {
  symbol: ChangedSymbol; impact?: DownstreamImpact; repoFullName?: string | null; sha?: string | null; degraded: boolean;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(true);
  const callers = impact?.callers ?? [];
  return <section aria-label={t("symbolImpact", { symbol: symbol.name, file: symbol.file })} data-symbol-file={symbol.file} style={s.symbol}>
    <div style={s.symbolHeader}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={s.symbolToggle}>
        <Icon.ChevronRight size={13} style={{ transform: open ? "rotate(90deg)" : undefined, color: "var(--text-muted)" }} />
        <strong className="mono">{symbol.name}</strong>
        <span style={s.kind}>{symbol.kind}</span>
        <span style={s.caption}>{t("callerCount", { count: callers.length })}</span>
      </button>
      <SourceReference repoFullName={repoFullName} sha={sha} file={symbol.file} />
    </div>
    {open && <div style={s.body}>
      {callers.length > 0 ? <ul aria-label={t("callersFor", { symbol: symbol.name, file: symbol.file })} style={s.callers}>
        {callers.map((caller) => <li key={JSON.stringify([caller.file, caller.name, caller.line])} style={s.caller}>
          <span className="mono">{caller.name}</span>
          <SourceReference repoFullName={repoFullName} sha={sha} file={caller.file} line={caller.line} />
        </li>)}
      </ul> : <p style={s.empty}>{t(degraded ? "noCallersPartial" : "noCallers")}</p>}
      {(impact?.endpoints_affected.length ?? 0) > 0 && <div role="group" aria-label={t("endpointsFor", { symbol: symbol.name, file: symbol.file })}>
        <div style={s.caption}>{t("stat.endpoints")}</div>
        <div style={s.chips}>{impact!.endpoints_affected.map((endpoint) => <span key={endpoint} className="mono" style={s.endpoint}>{endpoint}</span>)}</div>
      </div>}
      {(impact?.crons_affected.length ?? 0) > 0 && <div role="group" aria-label={t("cronsFor", { symbol: symbol.name, file: symbol.file })}>
        <div style={s.caption}>{t("stat.crons")}</div>
        <div style={s.chips}>{impact!.crons_affected.map((cron) => <span key={cron} className="mono" style={s.cron}>{cron}</span>)}</div>
      </div>}
    </div>}
  </section>;
}

export function BlastRadius({ prId, repoFullName, headSha }: { prId: string | null; repoFullName?: string | null; headSha?: string | null }) {
  const t = useTranslations("blast");
  const query = usePrBlastRadius(prId);
  if (!prId) return null;
  const data = query.data;
  const hasCallers = data?.downstream.some((impact) => impact.callers.length > 0);
  return <section aria-label={t("title")}>
    <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
    <div style={s.panel}>
      {query.isLoading && <div role="status"><p style={s.empty}>{t("loading")}</p><Skeleton height={60} /></div>}
      {query.isError && <div role="alert" style={s.error}>
        <strong>{t("loadError")}</strong>
        <span>{query.error instanceof Error ? query.error.message : t("errorBody")}</span>
        <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => void query.refetch()}>{t("retry")}</Button>
      </div>}
      {data && <>
        <div style={s.stats}>{(["symbols", "callers", "endpoints", "crons"] as const).map((key) => <div key={key} data-blast-stat={key} style={s.stat}>
          <span className="tnum" style={s.value}>{data.counts?.[key] ?? "—"}</span>
          <span style={s.caption}>{t(`stat.${key}`)}</span>
        </div>)}</div>
        {!data.counts && <p style={s.coverage}>{t("countsUnavailable")}</p>}
        <p style={s.coverage}>{data.indexed_sha ? t("indexedRevision", { sha: data.indexed_sha.slice(0, 12) }) : t("revisionUnavailable")}</p>
        {data.indexed_sha && headSha && data.indexed_sha !== headSha && <p style={s.coverage}>{t("differentRevision")}</p>}
        {data.degraded && <div role="status" style={s.warning}>
          <strong>{t("incomplete")}</strong>{" · "}{data.reason ? t(`reason.${data.reason}`) : t("reason.unknown")}
        </div>}
        {data.changed_symbols.length === 0 ? <p style={s.empty}>{t(data.degraded ? "noAvailableSymbols" : "noChangedSymbols")}</p>
          : !hasCallers && <p style={s.empty}>{data.degraded ? t("noCallersPartial") : (data.counts ? t("noDownstream", { count: data.counts.symbols }) : t("noCallers"))}</p>}
        <div style={s.list}>{data.changed_symbols.map((symbol) => <SymbolImpact key={JSON.stringify([symbol.file, symbol.name])} symbol={symbol}
          impact={data.downstream.find((impact) => impact.symbol_file === symbol.file && impact.symbol === symbol.name)}
          repoFullName={repoFullName} sha={data.indexed_sha} degraded={data.degraded} />)}</div>
      </>}
    </div>
  </section>;
}
