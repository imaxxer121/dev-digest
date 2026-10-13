import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, justifyContent: "space-between" } satisfies CSSProperties,
  panel: { padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 16, color: "var(--text-primary)" } satisfies CSSProperties,
  subtle: { margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, overflowWrap: "anywhere" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13, margin: 0 } satisfies CSSProperties,
  warning: { color: "var(--warn)", background: "var(--warn-bg)", fontSize: 13, padding: 10, borderRadius: 5 } satisfies CSSProperties,
  pre: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.5, maxHeight: 350, overflow: "auto", padding: 12, margin: 0, background: "var(--bg-surface)", color: "var(--text-secondary)", borderRadius: 5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  compare: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(310px,100%),1fr))", gap: 12 } satisfies CSSProperties,
  select: { width: "100%", padding: 8, border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 12, marginTop: 6 } satisfies CSSProperties,
  tableWrap: { overflowX: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  cell: { textAlign: "left", padding: "9px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
