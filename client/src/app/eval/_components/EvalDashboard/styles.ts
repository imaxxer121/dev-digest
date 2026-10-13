import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 1120, margin: "0 auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 22, color: "var(--text-primary)" } satisfies CSSProperties,
  subtle: { margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { margin: 0, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(330px,100%),1fr))", gap: 14 } satisfies CSSProperties,
  card: { padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  agent: { color: "var(--text-primary)", fontSize: 16, fontWeight: 650 } satisfies CSSProperties,
  tableWrap: { overflowX: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", color: "var(--text-secondary)", fontSize: 12 } satisfies CSSProperties,
  cell: { padding: "10px 8px", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
