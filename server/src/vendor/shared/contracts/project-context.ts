import { z } from 'zod';

/** Repository identities are retained even when two clones have the same path. */
export const AttachedDocument = z.object({
  repo_id: z.string().uuid(),
  path: z.string().min(1).max(1024).refine(path =>
    !/[\\:\x00-\x1f\x7f]/.test(path) && !path.startsWith('/') &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !/[. ]$/.test(part)) &&
    path.endsWith('.md'), 'Expected a canonical relative POSIX markdown path'),
}).strict();
export type AttachedDocument = z.infer<typeof AttachedDocument>;
export const AttachedDocuments = z.array(AttachedDocument).max(64).refine(docs =>
  new Set(docs.map(doc => `${doc.repo_id}/${doc.path}`)).size === docs.length, 'Duplicate document');

export const ContextDocument = z.object({
  path: z.string(), kind: z.string(), bytes: z.number().int().nonnegative(),
  estimated_tokens: z.number().int().nonnegative(), estimate_method: z.string(),
});
export type ContextDocument = z.infer<typeof ContextDocument>;
export const ContextSkip = z.object({ repo_id: z.string(), path: z.string(), reason: z.string() });
export type ContextSkip = z.infer<typeof ContextSkip>;
export const ProjectContextDiscovery = z.object({
  documents: z.array(ContextDocument),
  summary: z.object({
    state: z.enum(['available', 'unavailable', 'limited']), document_count: z.number().int(),
    total_estimated_tokens: z.number().int(), refreshed_at: z.string(),
    limits: z.object({ documents: z.number().int(), document_bytes: z.number().int(), scanned_entries: z.number().int(), depth: z.number().int() }),
    reasons: z.array(z.string()),
  }),
});
export type ProjectContextDiscovery = z.infer<typeof ProjectContextDiscovery>;
export const ProjectContextPreview = ContextDocument.extend({ content: z.string() });
export type ProjectContextPreview = z.infer<typeof ProjectContextPreview>;
/** Optional on historical / CI traces: absence means unknown, never zero. */
export const ProjectContextTrace = z.object({
  reads: z.array(ContextDocument.extend({ repo_id: z.string() })),
  skipped: z.array(ContextSkip), estimated_tokens: z.number().int().nonnegative(),
  estimate_method: z.string(), bytes: z.number().int().nonnegative(),
  token_limit: z.number().int(), document_byte_limit: z.number().int(),
});
export type ProjectContextTrace = z.infer<typeof ProjectContextTrace>;
