"use client";

import { useTranslations } from "next-intl";
import type { Intent } from "@devdigest/shared";

export function IntentBlock({ intent }: { intent: Intent }) {
  const t = useTranslations("intent");
  return <div>
      <p>{intent.intent}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {(["in_scope", "out_of_scope"] as const).map((key) => <div key={key}>
          <strong>{t(key === "in_scope" ? "inScope" : "outOfScope")}</strong>
          {intent[key].length ? <ul>{intent[key].map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>{t("emptyScope")}</p>}
        </div>)}
      </div>
  </div>;
}
