import { describe, it, expect } from 'vitest';
import { groundEvidence } from '../src/modules/conventions/helpers.js';
describe('Convention evidence', () => {
  const candidate = {category:'errors', rule:'Return typed errors', evidence_path:'src/api.ts', evidence_snippet:'throw new NotFoundError();', confidence:0.9};
  const files = new Map([['src/api.ts', 'export function load() {\n  throw new NotFoundError();\n}\n']]);
  it('computes the line from a real exact snippet', () => {
    expect(groundEvidence(candidate, files)?.evidence_line).toBe(2);
  });
  it('drops invented paths, invented snippets and empty evidence', () => {
    expect(groundEvidence({...candidate,evidence_path:'src/missing.ts'}, files)).toBeNull();
    expect(groundEvidence({...candidate,evidence_snippet:'throw new Error();'}, files)).toBeNull();
    expect(groundEvidence({...candidate,evidence_snippet:' '}, files)).toBeNull();
  });
});
