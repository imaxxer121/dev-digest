"use client";

import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { Intent } from "@devdigest/shared";

export function IntentBlock({ intent, generated }: { intent: Intent | null; generated: boolean }) {
  const t = useTranslations("brief");
  return <section aria-label={t("block.intent")}>
    <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
    {intent ? <>
      <p>{intent.intent}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("intentFreshness")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {(["in_scope", "out_of_scope"] as const).map((key) => <div key={key}>
          <strong>{t(key === "in_scope" ? "inScope" : "outOfScope")}</strong>
          {intent[key].length ? <ul>{intent[key].map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>{t("emptyScope")}</p>}
        </div>)}
      </div>
    </> : <p style={{ color: "var(--text-muted)" }}>{t(generated ? "missingIntent" : "intentBeforeGeneration")}</p>}
  </section>;
}
