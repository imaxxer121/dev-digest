"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";
import { BlastRadius } from "../BlastRadius";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      <BlastRadius key={prId} prId={prId} repoFullName={repoFullName} headSha={headSha} />
    </>
  );
}
