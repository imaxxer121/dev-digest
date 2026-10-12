import { BlastRadius } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/** Map cached provenance into the public grouped view; no I/O or inference. */
export function mapBlastRadius(result: BlastResult): BlastRadius {
  const symbols = [...new Map(result.changedSymbols.map(s => [JSON.stringify([s.file, s.name]), s])).values()];
  const downstream = symbols.map(symbol => {
    const matches = result.callers.filter(c => c.viaSymbol === symbol.name && c.file !== symbol.file &&
      (c.viaFile === symbol.file || (!c.viaFile && symbols.filter(s => s.name === symbol.name).length === 1)));
    const callers = [...new Map(matches.filter(c => c.line > 0).map(c =>
      [JSON.stringify([c.file, c.symbol, c.line]), { name: c.symbol, file: c.file, line: c.line }])).values()];
    const endpoints = new Set<string>(); const crons = new Set<string>();
    for (const caller of callers) {
      const facts = result.factsByFile?.[caller.file];
      for (const endpoint of facts?.endpoints ?? []) endpoints.add(endpoint);
      for (const cron of facts?.crons ?? []) crons.add(cron);
    }
    return { symbol: symbol.name, symbol_file: symbol.file, callers,
      endpoints_affected: [...endpoints].sort(), crons_affected: [...crons].sort() };
  });
  const counts = {
    symbols: symbols.length,
    callers: new Set(downstream.flatMap(d => d.callers.map(c => JSON.stringify([c.file, c.name, c.line])))).size,
    endpoints: new Set(downstream.flatMap(d => d.endpoints_affected)).size,
    crons: new Set(downstream.flatMap(d => d.crons_affected)).size,
  };
  return BlastRadius.parse({ changed_symbols: symbols, downstream, counts,
    summary: `${counts.symbols} symbols · ${counts.callers} callers · ${counts.endpoints} endpoints · ${counts.crons} cron/jobs`,
    degraded: result.degraded ?? false, reason: result.reason ?? null,
    indexed_sha: result.indexedSha || null });
}
