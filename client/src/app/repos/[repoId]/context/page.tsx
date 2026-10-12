"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextFiles, useSaveContextFile } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ContextEditor } from "./_components/ContextEditor";

export default function ContextPage() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const files = useContextFiles(repoNotFound ? null : repoId);
  const save = useSaveContextFile(repoId);
  return <AppShell crumb={[{ label: activeRepo?.full_name ?? repoId, href: `/repos/${repoId}/pulls` }, { label: t("title") }]}>
    {repoNotFound ? <RepoNotFound /> : <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px 44px" }}>
      <h1 style={{ fontSize: 24 }}>{t("title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>{t("subtitle")}</p>
      <ContextEditor key={repoId} files={files.data ?? []} loading={files.isLoading} loadError={files.error}
        pending={save.isPending} saveError={save.error} onRetry={() => void files.refetch()}
        onSave={(input) => save.mutateAsync(input)} onResetError={() => save.reset()} />
    </div>}
  </AppShell>;
}
