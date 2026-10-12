"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { FileCard } from "../FileCard";
import { hasOpenDraftFor, type DiffCommentApi } from "../comments";
import { findingFileCount, type DiffFindingsApi } from "../findings";
import { s, chevronFor } from "../styles";

export function RoleGroup({ role, files, commenting, reviewing }: {
  role: SmartDiffRole;
  files: PrFile[];
  commenting?: DiffCommentApi;
  reviewing?: DiffFindingsApi;
}) {
  const t = useTranslations("prReview.smartDiff");
  const [open, setOpen] = React.useState((role !== "docs" && role !== "boilerplate") || files.some((file) => hasOpenDraftFor(file.path, commenting?.drafts)));
  const count = findingFileCount(files, reviewing?.findings ?? []);
  return (
    <section data-diff-role={role} style={s.group}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={s.groupHeader}>
        <Icon.ChevronRight size={14} style={chevronFor(open)} />
        <strong>{t(`${role}Label`)}</strong>
        <span>{t("filesCount", { count: files.length })}</span>
        <span style={s.groupCount}>{t("findingFiles", { count })}</span>
      </button>
      {open && <div style={s.list}>
        {files.map((file) => <FileCard key={file.path} file={file} commenting={commenting} reviewing={reviewing} />)}
        {files.length === 0 && <div style={s.empty}>{t("emptyGroup")}</div>}
      </div>}
    </section>
  );
}
