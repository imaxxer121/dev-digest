"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";
import { BlastRadius } from "../BlastRadius";
import { PrBrief, type PrBriefProps } from "../PrBrief";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  brief: Omit<PrBriefProps, "children" | "headSha">;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha, brief }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      <PrBrief {...brief} headSha={headSha}>
        <BlastRadius key={prId} prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </PrBrief>
    </>
  );
}
