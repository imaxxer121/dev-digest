"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useConvertFindingToEval } from "@/lib/hooks/evals";

export function EvalCaseAction({ findingId, disabled }: { findingId: string; disabled?: boolean }) {
  const t = useTranslations("prReview.finding");
  const conversion = useConvertFindingToEval();
  return <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
    <Button kind="secondary" size="sm" icon="FlaskConical" disabled={disabled || conversion.isPending} loading={conversion.isPending}
      onClick={() => conversion.mutate({ findingId })}>{t(conversion.isPending ? "creatingEval" : "turnIntoEval")}</Button>
    {conversion.data && <div role="status" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
      {t(conversion.data.created ? "evalCreated" : "evalExisting")} {" "}
      <a href={`/agents/${conversion.data.case.owner_id}?tab=evals`}>{t("viewEvals")}</a>
    </div>}
    {conversion.isError && <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--crit)" }}>{conversion.error instanceof Error ? conversion.error.message : t("evalError")}</p>}
  </div>;
}
