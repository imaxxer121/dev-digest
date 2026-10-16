"use client";

import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRecalculateIntent } from "@/lib/hooks/intent";
import { IntentBlock } from "../IntentBlock";

export function IntentCard({ prId, headSha }: { prId: string | null; headSha?: string | null }) {
  const t = useTranslations("intent");
  const query = usePrIntent(prId);
  const recalculate = useRecalculateIntent(prId);
  const response = query.data;
  const saved = response?.intent;
  const stale = !!saved?.head_sha && (response?.freshness === "stale" || (!!headSha && saved.head_sha !== headSha));
  return <section aria-label={t("title")} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
    <SectionLabel icon="Target" right={<Button kind="secondary" size="sm" loading={recalculate.isPending}
      disabled={!prId || query.isLoading || recalculate.isPending} onClick={() => recalculate.mutate()}>
      {t(recalculate.isPending ? "pendingAction" : "recalculate")}</Button>}>{t("title")}</SectionLabel>
    {query.isLoading && <div role="status"><p>{t("loading")}</p><Skeleton height={48} /></div>}
    {query.error && <div role="alert"><p>{t("loadError")}: {query.error.message}</p>
      <Button kind="secondary" size="sm" onClick={() => void query.refetch()}>{t("retry")}</Button></div>}
    {recalculate.isPending && <p role="status">{t("pending")}</p>}
    {recalculate.error && <p role="alert" style={{ color: "var(--crit)" }}>{t("failure")}: {recalculate.error.message}</p>}
    {saved ? <>
      {stale && <p role="status">{t("stale")}</p>}
      {!saved.head_sha && <p role="status">{t("unknown")}</p>}
      <IntentBlock intent={saved} />
    </> : !query.isLoading && <p style={{ color: "var(--text-muted)" }}>{t("missing")}</p>}
    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("metadataOnly")}</p>
  </section>;
}
