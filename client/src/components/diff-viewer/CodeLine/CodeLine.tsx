/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV, type Severity } from "@devdigest/ui";
import { commentTargetFor, commentDraftKey, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import type { FindingRecord } from "@devdigest/shared";
import type { DiffFindingsApi } from "../findings";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = [],
  reviewing,
  focusRef,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: FindingRecord[];
  reviewing?: DiffFindingsApi;
  focusRef?: React.Ref<HTMLDivElement>;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const t = useTranslations("prReview.smartDiff");

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const markedSeverity = reviewing?.showComments
    ? (["CRITICAL", "WARNING", "SUGGESTION", "INFO"] as Severity[]).find((severity) => findings.some((finding) => finding.severity === severity))
    : undefined;
  const severityLabel = markedSeverity ? t(`rowSeverity.${markedSeverity}`) : null;
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const draftKey = target ? commentDraftKey(path, target.line, target.side) : null;
  const isComposing = draftKey ? (commenting?.drafts?.values[draftKey]?.open ?? composing) : false;
  const setComposer = (open: boolean) => {
    setComposing(open);
    if (draftKey) commenting?.drafts?.update(draftKey, { open });
  };
  const showAdd = hover && !!target && !isComposing;

  return (
    <div
      ref={focusRef}
      tabIndex={focusRef ? -1 : undefined}
      data-diff-focused={focusRef ? true : undefined}
      data-diff-row={ln.newNo != null ? `RIGHT:${ln.newNo}` : `LEFT:${ln.oldNo}`}
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div data-row-severity={markedSeverity} style={{
        ...lineRowFor(ln.kind),
        borderLeftWidth: markedSeverity ? 3 : 0,
        borderLeftStyle: "solid",
        borderLeftColor: markedSeverity ? SEV[markedSeverity].c : "transparent",
      }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposer(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {markedSeverity && <span aria-label={t("rowFinding", { severity: severityLabel })} style={{
          alignSelf: "center", flexShrink: 0, margin: "0 12px 0 8px", padding: "1px 6px",
          borderRadius: 4, fontSize: 11, fontWeight: 600,
          color: SEV[markedSeverity].c, background: SEV[markedSeverity].bg,
        }}>{severityLabel}</span>}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {reviewing?.showComments && findings.length > 0 && <div style={s.findingRail}>
        {findings.map((finding) => <React.Fragment key={finding.id}>{reviewing.renderFinding(finding)}</React.Fragment>)}
      </div>}

      {commenting && isComposing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposer(false)}
        />
      )}
    </div>
  );
}
