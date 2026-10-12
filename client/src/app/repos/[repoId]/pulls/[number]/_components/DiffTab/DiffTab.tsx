"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, usePrSmartDiff, useFindingAction } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

/** Match server latest-review ordering, including a deterministic tie break. */
export function latestReview(reviews: ReviewRecord[]) {
  return reviews.filter((review) => review.kind === "review").sort((a, b) =>
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const { data: comments } = usePrComments(prId);
  const smart = usePrSmartDiff(prId);
  const reviews = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  const action = useFindingAction();
  const [showComments, setShowComments] = React.useState(true);
  const [grouped, setGrouped] = React.useState(true);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const latest = latestReview(reviews.data ?? []);
  const findings = latest?.findings ?? [];
  const count = (comments?.length ?? 0) + findings.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [], canComment: !!canComment && !!prId, showComments, posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true);
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("commentError"));
        throw err;
      }
    },
  };
  const reviewing: DiffFindingsApi = {
    findings, showComments,
    renderFinding: (finding) => <FindingCard f={finding} defaultExpanded showSeverityLabel
      repoFullName={repoFullName} headSha={headSha}
      pending={action.isPending && action.variables?.findingId === finding.id}
      onAction={async (kind, reply) => {
        setActionError(null);
        try {
          await action.mutateAsync({ findingId: finding.id, action: kind, reply, prId: prId ?? undefined });
        } catch (err) {
          setActionError(err instanceof Error ? err.message : t("actionError"));
        }
      }} />,
  };

  return <section>
    <SectionLabel icon="Code" right={count > 0 ? <Button kind="ghost" size="sm"
      icon={showComments ? "EyeOff" : "Eye"} onClick={() => setShowComments((value) => !value)}>
      {t(showComments ? "hideComments" : "showComments", { count })}
    </Button> : undefined}>{t("changedFiles", { count: filesCount })}</SectionLabel>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <Button kind="secondary" size="sm" active={grouped} aria-pressed={grouped} onClick={() => setGrouped(true)}>{t("groupedByRole")}</Button>
      <Button kind="secondary" size="sm" active={!grouped} aria-pressed={!grouped} onClick={() => setGrouped(false)}>{t("originalOrder")}</Button>
    </div>
    {(smart.isError || reviews.isError) ? <div role="alert" style={{ marginBottom: 12, color: "var(--warn)" }}>
      {t("loadError")} <Button kind="ghost" size="sm" onClick={() => { smart.refetch(); reviews.refetch(); }}>{t("retry")}</Button>
    </div> : (smart.isLoading || reviews.isLoading) ? <p role="status">{t("loading")}</p>
      : <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{latest ? (findings.length === 0 ? t("reviewedClean") : t("latestFindings", { count: findings.length })) : t("noReview")}</p>}
    {actionError && <p role="alert" style={{ color: "var(--crit)" }}>{actionError}</p>}
    <DiffViewer files={files} commenting={commenting} reviewing={reviewing}
      groups={grouped && !smart.isError ? smart.data?.groups : undefined} />
  </section>;
}
