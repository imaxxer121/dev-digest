import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { classifyFile, buildSmartDiff } from '../src/modules/reviews/smart-diff/index.js';

describe('Smart Diff classification precedence', () => {
  it.each([
    ['server/src/billing.ts', 'core'], ['client/src/Button.tsx', 'core'],
    ['notes.txt', 'core'], ['server/pnpm-lock.yaml', 'boilerplate'],
    ['package-lock.json', 'boilerplate'], ['yarn.lock', 'boilerplate'],
    ['deps.lock', 'boilerplate'], ['client/dist/index.js', 'boilerplate'],
    ['build/readme.md', 'boilerplate'], ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['client/ui.snap', 'boilerplate'], ['src/types.generated.ts', 'boilerplate'],
    ['assets/app.min.js', 'boilerplate'], ['src/x.test.ts', 'tests'],
    ['src/x.test.tsx', 'tests'], ['server/test/x.it.test.ts', 'tests'],
    ['src/x.spec.ts', 'tests'], ['test/fixtures/index.ts', 'tests'],
    ['tests/readme.md', 'tests'], ['src/__tests__/x.ts', 'tests'],
    ['e2e/README.md', 'tests'], ['src/index.ts', 'wiring'],
    ['src/index.js', 'wiring'], ['next.config.mjs', 'wiring'],
    ['client/tsconfig.build.json', 'wiring'], ['.eslintrc.json', 'wiring'],
    ['.env.example', 'wiring'], ['docker-compose.dev.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'], ['.claude/skills/security/SKILL.md', 'wiring'],
    ['README.md', 'docs'], ['docs/api.json', 'docs'], ['CHANGELOG', 'docs'],
    ['LICENSE', 'docs'], ['server/guide.md', 'docs'], ['docs/说明.md', 'docs'],
    ['server\\test\\fixture.ts', 'tests'], ['src/index.tsx', 'core'],
  ])('%s → %s', (path, role) => { expect(classifyFile(path)).toBe(role); });
});

describe('Smart Diff grouping', () => {
  const files = [
    { path: 'README.md', additions: 1, deletions: 2 },
    { path: 'src/b.ts', additions: 3, deletions: 4 },
    { path: 'src/a.ts', additions: 5, deletions: 6 },
    { path: 'src/a.test.ts', additions: 7, deletions: 8 },
    { path: 'index.ts', additions: 0, deletions: 0 },
    { path: 'pnpm-lock.yaml', additions: 1, deletions: 0 },
  ];
  it('emits five ordered roles, preserves input order within roles and does not mutate input', () => {
    const before = structuredClone(files);
    const result = SmartDiff.parse(buildSmartDiff(files, []));
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(result.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(files).toEqual(before);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 37, proposed_splits: [] });
  });
  it('deduplicates and sorts new-side start lines for the matching file only', () => {
    const result = buildSmartDiff(files, [
      { file: 'src/a.ts', startLine: 20 }, { file: 'src/a.ts', startLine: 10 },
      { file: 'src/a.ts', startLine: 20 }, { file: 'absent.ts', startLine: 2 },
      { file: 'src/b.ts', startLine: 0 },
    ]);
    expect(result.groups[0]!.files.map((f) => f.finding_lines)).toEqual([[], [10, 20]]);
  });
  it('keeps five empty roles and no invented split plan for an empty PR', () => {
    const result = buildSmartDiff([], []);
    expect(result.groups).toHaveLength(5);
    expect(result.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(result.split_suggestion.total_lines).toBe(0);
  });
});
