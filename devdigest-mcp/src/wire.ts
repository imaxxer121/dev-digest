import * as z from 'zod/v4';

/** Wire validation for the independent MCP package; retain the exact API document. */
export const BlastDocument = z.object({
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
  downstream: z.array(z.object({ symbol: z.string(), symbol_file: z.string().optional(),
    callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.number().int() })),
    endpoints_affected: z.array(z.string()), crons_affected: z.array(z.string()) })),
  summary: z.string(), degraded: z.boolean(),
  reason: z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']).nullish(),
  indexed_sha: z.string().nullish(),
  counts: z.object({ symbols: z.number().int().nonnegative(), callers: z.number().int().nonnegative(),
    endpoints: z.number().int().nonnegative(), crons: z.number().int().nonnegative() }).optional(),
}).passthrough();
