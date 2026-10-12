/* CommentThreadView — a single thread (root comment + replies) with an inline
   reply composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { type CommentThread, type DiffCommentApi, commentDraftKey, cs } from "../comments";
import { CommentCard } from "../CommentCard";
import { InlineComposer } from "../InlineComposer";

export function CommentThreadView({
  thread,
  commenting,
  path,
}: {
  thread: CommentThread;
  commenting: DiffCommentApi;
  path: string;
}) {
  const t = useTranslations("shell");
  const [replying, setReplying] = React.useState(false);
  const draftKey = commentDraftKey(path, thread.line ?? 0, thread.side, thread.rootId);
  const isReplying = commenting.drafts?.values[draftKey]?.open ?? replying;
  const setReplyComposer = (open: boolean) => {
    setReplying(open);
    commenting.drafts?.update(draftKey, { open });
  };
  return (
    <div style={cs.thread}>
      {thread.comments.map((c) => (
        <CommentCard key={c.id} c={c} />
      ))}
      {commenting.canComment &&
        (isReplying ? (
          <InlineComposer
            commenting={commenting}
            path={path}
            line={thread.line!}
            side={thread.side}
            inReplyTo={thread.rootId}
            onClose={() => setReplyComposer(false)}
          />
        ) : (
          <div>
            <Button
              kind="ghost"
              size="sm"
              icon="CornerDownRight"
              onClick={() => setReplyComposer(true)}
            >
              {t("diffViewer.reply")}
            </Button>
          </div>
        ))}
    </div>
  );
}
