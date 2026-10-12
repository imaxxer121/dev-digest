"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";

const LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
const COLORS: Record<Severity, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

export function SeverityFilter({
  findings,
  shown,
  value,
  onChange,
}: {
  findings: FindingRecord[];
  shown: FindingRecord[];
  value: Severity | null;
  onChange: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const finding of shown) counts[finding.severity]++;

  return (
    <div style={{ marginBottom: 18 }}>
      <div aria-label="Visible findings counts" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {LEVELS.filter((level) => counts[level] > 0).map((level) => (
          <Badge key={level} color={COLORS[level]} bg="transparent">{counts[level]} {level}</Badge>
        ))}
      </div>
      <div role="group" aria-label={t("panel.severityFilter")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {LEVELS.map((severity) => (
        <Button
          key={severity}
          kind={value === severity ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={value === severity}
          onClick={() => onChange(value === severity ? null : severity)}
          style={{
            color: COLORS[severity],
            borderColor: value === severity ? COLORS[severity] : "var(--border)",
          }}
        >
          {severity.charAt(0) + severity.slice(1).toLowerCase()}
        </Button>
      ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
        {shown.length} / {findings.length} findings · click the selected filter again to show all
      </div>
    </div>
  );
}
