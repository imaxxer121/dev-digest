import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFICATION_RULES } from './constants.js';

/** Standalone classifier: no HTTP, database, filesystem or inference. */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) return rule.role;
  }
  return 'core';
}
