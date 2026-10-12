/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi, type DiffDraftApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import { RoleGroup } from "../RoleGroup";
import { groupedFiles, type DiffFindingsApi } from "../findings";
import type { SmartDiffResponse } from "@devdigest/shared";
import type { DiffFocusTarget } from "../focus";

export function DiffViewer({
  files,
  commenting,
  reviewing,
  groups,
  focusTarget,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  reviewing?: DiffFindingsApi;
  groups?: SmartDiffResponse["groups"];
  focusTarget?: DiffFocusTarget | null;
}) {
  const t = useTranslations("shell");
  const brief = useTranslations("brief");
  const [drafts, setDrafts] = React.useState<DiffDraftApi["values"]>({});
  const updateDraft = React.useCallback<DiffDraftApi["update"]>((key, patch) => {
    setDrafts((before) => ({ ...before, [key]: { open: false, text: "", ...before[key], ...patch } }));
  }, []);
  const commentsWithDrafts = commenting ? { ...commenting, drafts: { values: drafts, update: updateDraft } } : undefined;
  const missingTarget = focusTarget && !files.some((file) => file.path === focusTarget.file);
  const notice = missingTarget ? <p role="status" style={{ color: "var(--warn)", fontSize: 13 }}>
    {brief("focus.fileMissing", { file: focusTarget.file })}{" "}{brief("focus.callerSnapshot")}
  </p> : null;
  if (groups) {
    return <div>{notice}<div style={s.list}>{groupedFiles(files, groups).map((group) => (
      <RoleGroup key={group.role} {...group} commenting={commentsWithDrafts} reviewing={reviewing} focusTarget={focusTarget} />
    ))}</div></div>;
  }
  if (!files || files.length === 0) {
    return <div>{notice}<div style={s.empty}>{t("diffViewer.noChangedFiles")}</div></div>;
  }
  return (
    <div>{notice}<div style={s.list}>
      {files.map((f) => (
        <FileCard key={f.path} file={f} commenting={commentsWithDrafts} reviewing={reviewing} focusTarget={focusTarget} />
      ))}
    </div></div>
  );
}
