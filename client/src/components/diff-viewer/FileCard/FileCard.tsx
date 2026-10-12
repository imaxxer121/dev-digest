/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  hasOpenDraftFor,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { partitionFindings, type DiffFindingsApi } from "../findings";
import type { DiffFocusTarget } from "../focus";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({ file, commenting, reviewing, focusTarget }: { file: PrFile; commenting?: DiffCommentApi; reviewing?: DiffFindingsApi; focusTarget?: DiffFocusTarget | null }) {
  const t = useTranslations("shell");
  const smart = useTranslations("prReview.smartDiff");
  const brief = useTranslations("brief");
  const isTarget = focusTarget?.file === file.path;
  const [open, setOpen] = React.useState(
    isTarget || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES || hasOpenDraftFor(file.path, commenting?.drafts)
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const headerRef = React.useRef<HTMLButtonElement>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const targetRowIndex = isTarget ? lines.findIndex((line) => line.newNo === focusTarget?.line) : -1;
  React.useEffect(() => {
    if (isTarget) setOpen(true);
  }, [isTarget, focusTarget?.line]);
  React.useEffect(() => {
    if (!isTarget || !open) return;
    const element = targetRowIndex >= 0 ? rowRef.current : headerRef.current;
    element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    element?.focus({ preventScroll: true });
  }, [isTarget, focusTarget?.line, open, targetRowIndex]);
  const fileFindings = (reviewing?.findings ?? []).filter((f) => f.file === file.path);
  const { byRow, outside } = partitionFindings(lines, fileFindings);
  const dotSeverity = (["CRITICAL", "WARNING", "SUGGESTION", "INFO"] as Severity[])
    .find((severity) => fileFindings.some((f) => f.severity === severity));

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard} data-diff-file={file.path}>
      <button ref={headerRef} type="button" aria-expanded={open} aria-label={file.path} onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {fileFindings.length > 0 && <span
          role="img" aria-label={smart("fileFindings", { count: fileFindings.length })}
          title={smart("fileFindings", { count: fileFindings.length })}
          style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: dotSeverity ? SEV[dotSeverity].c : "var(--text-muted)" }}
        />}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            aria-label={smart("humanComments", { count: commentCount })}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </button>
      {open && (
        <div style={s.fileBody}>
          {isTarget && targetRowIndex < 0 && <p role="status" style={{ padding: "8px 14px", color: "var(--warn)", fontSize: 13 }}>
            {brief("focus.lineMissing", { file: file.path, line: focusTarget!.line })}
          </p>}
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={byRow.get(i) ?? []}
                reviewing={reviewing}
                focusRef={i === targetRowIndex ? rowRef : undefined}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {reviewing?.showComments && outside.length > 0 && <div style={s.findingRail} data-off-patch>
            <div style={s.outsideLabel}>{smart("outsidePatch")}</div>
            {outside.map((finding) => <React.Fragment key={finding.id}>{reviewing.renderFinding(finding)}</React.Fragment>)}
          </div>}
        </div>
      )}
    </div>
  );
}
