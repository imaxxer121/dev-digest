"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";

const LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
const COLORS: Record<Severity, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

export function SeverityFilter({
  findings,
  value,
  onChange,
}: {
  findings: FindingRecord[];
  value: Severity | null;
  onChange: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const finding of findings) counts[finding.severity]++;

  return (
    <div
      role="group"
      aria-label={t("panel.severityFilter")}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}
    >
      <Button
        kind={value === null ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        {t("panel.allFindings", { count: findings.length })}
      </Button>
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
          {counts[severity]} {severity}
        </Button>
      ))}
    </div>
  );
}
