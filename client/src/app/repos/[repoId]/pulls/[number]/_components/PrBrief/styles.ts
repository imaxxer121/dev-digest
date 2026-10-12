import type { CSSProperties } from "react";

export const s = {
  region: { display: "flex", flexDirection: "column", gap: 22 } as CSSProperties,
  panel: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-surface)", padding: 20 } as CSSProperties,
  title: { margin: "0 0 12px", fontSize: 16 } as CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } as CSSProperties,
  notice: { padding: "10px 12px", background: "var(--warn-bg)", color: "var(--warn)", borderRadius: 6, marginBottom: 14 } as CSSProperties,
  risks: { display: "grid", gap: 12 } as CSSProperties,
  risk: { padding: 14, border: "1px solid var(--border)", borderRadius: 6 } as CSSProperties,
  reference: { color: "var(--accent)", background: "transparent", border: "none", padding: "2px 0", textAlign: "left", cursor: "pointer", overflowWrap: "anywhere", fontSize: 13 } as CSSProperties,
  focus: { display: "grid", gap: 10, paddingLeft: 22 } as CSSProperties,
  sources: { display: "grid", gap: 5, paddingLeft: 18, fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
};
