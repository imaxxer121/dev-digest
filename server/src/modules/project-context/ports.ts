import type { ContextDocument, ProjectContextDiscovery } from '@devdigest/shared';

/** Filesystem stays at the outer boundary; callers supply only trusted scoped roots. */
export interface ProjectContextFiles {
  discover(cloneRoot: string | null): Promise<ProjectContextDiscovery>;
  read(cloneRoot: string | null, path: string): Promise<ContextDocument & { content: string }>;
  accepts(path: string): boolean;
}
export interface ContextEstimator { count(text: string): number; method: string }
export interface ContextLimits { attachments: number; documentBytes: number; documents: number; tokens: number; entries: number; depth: number }
export const CONTEXT_LIMITS: Readonly<ContextLimits> = Object.freeze({ attachments: 64, documentBytes: 65_536, documents: 2_000, tokens: 8_000, entries: 32_000, depth: 40 });
export const DEFAULT_CONTEXT_ROOTS = ['specs', 'docs', 'insights'] as const;
