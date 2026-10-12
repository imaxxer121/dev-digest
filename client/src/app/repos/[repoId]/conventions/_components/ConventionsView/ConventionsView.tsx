"use client";
import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Modal } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useConventions, useExtractConventions, useUpdateConvention, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useRepos } from "@/lib/hooks";
import { ConventionCard } from "../ConventionCard";
import { s } from "./styles";
import { acceptedSkillDraft } from "./helpers";
import { githubBlobUrl } from "@/lib/github-urls";
export function ConventionsView() {
  const t = useTranslations("conventions");
  const {repoId} = useParams<{repoId: string}>();
  const {data: repos} = useRepos();
  const repo = repos?.find(r => r.id === repoId);
  const query = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const create = useCreateConventionSkill(repoId);
  const [modal, setModal] = React.useState(false);
  const [name, setName] = React.useState("repo-conventions");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [created, setCreated] = React.useState<string>();
  const candidates = query.data ?? [];
  const accepted = candidates.filter(c => c.status === "accepted").length;
  const input = {width:"100%", padding:10, background:"var(--bg-surface)", color:"var(--text-primary)", border:"1px solid var(--border)", borderRadius:6};
  return <AppShell crumb={[{label:t("page.crumbLab")},{label:t("page.crumbConventions")}] }>
    <div style={s.page}><div style={s.header}><div style={s.headerMain}><h1 style={s.h1}>{t("page.headingPrefix")}{repo?.full_name ?? "…"}</h1><p style={s.subtitle}>{t("page.subtitle")}</p></div></div>
      <div style={{display:"flex", gap:8, marginBottom:20}}>
        <Button kind="primary" size="sm" disabled={extract.isPending || candidates.length > 0} onClick={() => extract.mutate()}>{extract.isPending ? t("page.scanning") : t("page.runScan")}</Button>
        <Button kind="secondary" size="sm" disabled={extract.isPending || !candidates.length} onClick={() => extract.mutate()}>{t("page.rescan")}</Button>
        <Button kind="secondary" size="sm" disabled={!accepted} onClick={() => {setBody(acceptedSkillDraft(candidates)); setModal(true);}}>{t("page.createSkill")}</Button>
      </div>
      {(query.error || extract.error) && <ErrorState body={(query.error ?? extract.error)?.message ?? ""} onRetry={() => query.refetch()} />}
      {created && <p role="status">{t("page.created", {name:created})}</p>}
      {!query.isLoading && !candidates.length && !extract.isPending && <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.empty.body")} />}
      {candidates.map(c => <ConventionCard key={c.id} c={c} evidenceUrl={repo ? githubBlobUrl(repo.full_name, encodeURIComponent(repo.default_branch), c.evidence_path, c.evidence_line) : undefined} pending={update.isPending && update.variables?.id === c.id} onUpdate={patch => update.mutateAsync({id:c.id, patch})} />)}
    </div>
    {modal && <Modal title={t("page.createSkill")} onClose={() => setModal(false)} width={720} footer={<div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Button kind="secondary" onClick={() => setModal(false)}>{t("card.cancel")}</Button><Button kind="primary" loading={create.isPending} disabled={!name.trim() || !body.trim()} onClick={() => create.mutate({name:name.trim(),description,body}, {onSuccess: skill => {setCreated(skill.name); setModal(false);}})}>{t("page.create")}</Button></div>}>
      <div style={{padding:24,display:"grid",gap:14}}><p>{t("page.modalExplanation", {count:accepted})}</p><label>{t("page.skillName")}<input aria-label={t("page.skillName")} style={input} value={name} onChange={e => setName(e.target.value)} /></label><label>{t("page.skillDescription")}<input aria-label={t("page.skillDescription")} style={input} value={description} onChange={e => setDescription(e.target.value)} /></label><label>{t("page.skillBody")}<textarea aria-label={t("page.skillBody")} style={{...input,minHeight:220,fontFamily:"var(--font-mono)"}} value={body} onChange={e => setBody(e.target.value)} /></label>{create.error && <p role="alert">{create.error.message}</p>}</div>
    </Modal>}
  </AppShell>;
}
