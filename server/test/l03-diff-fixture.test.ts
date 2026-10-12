import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

describe('review route diff fixture', () => {
  it('keeps new-side lines available for reviewer citation grounding', () => {
    const raw = [
      'diff --git a/server/src/modules/reviews/routes.ts b/server/src/modules/reviews/routes.ts',
      '--- a/server/src/modules/reviews/routes.ts',
      '+++ b/server/src/modules/reviews/routes.ts',
      '@@ -10,1 +10,2 @@',
      ' existingLine();',
      '+await fetch(destination);',
    ].join('\n');
    const file = parseUnifiedDiff(raw).files[0]!;
    expect(file.path).toBe('server/src/modules/reviews/routes.ts');
    expect(file.additions).toBe(1);
    expect(file.hunks[0]!.newLineNumbers).toEqual([10, 11]);
  });
});
