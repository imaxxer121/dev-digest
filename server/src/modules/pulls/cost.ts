/** A total must cover every successful run, even older runs. Missing prices
 * mean the total is unknown; never present a partial sum as the total. */
export function successfulRunCosts(rows: readonly { prId: string | null; costUsd: number | null }[]): Map<string, number | null> {
  const costs = new Map<string, number | null>();
  for (const row of rows) {
    if (!row.prId) continue;
    const previous = costs.get(row.prId);
    costs.set(row.prId, row.costUsd == null || previous === null ? null : (previous ?? 0) + row.costUsd);
  }
  return costs;
}
