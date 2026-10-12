import type { SmartDiffRole } from '@devdigest/shared';

export const ROLE_ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const satisfies readonly SmartDiffRole[];

/** First match wins. Classification priority differs from display order. */
export const CLASSIFICATION_RULES: readonly {
  role: SmartDiffRole;
  patterns: readonly RegExp[];
}[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
      /\.lock$/,
      /(?:^|\/)(?:dist|build|__snapshots__)\//,
      /\.snap$/,
      /\.generated\./,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.(?:test|spec)\.[cm]?[jt]sx?$/,
      /(?:^|\/)(?:test|tests|__tests__|e2e)\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(?:^|\/)index\.[cm]?[jt]s$/,
      /\.config\./,
      /(?:^|\/)tsconfig[^/]*\.json$/,
      /(?:^|\/)\.eslintrc[^/]*$/,
      /(?:^|\/)\.env[^/]*$/,
      /(?:^|\/)docker-compose[^/]*\.ya?ml$/,
      /(?:^|\/)(?:\.github|\.claude)\//,
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.mdx?$/,
      /(?:^|\/)docs\//,
      /(?:^|\/)(?:README[^/]*|CHANGELOG[^/]*|LICENSE)$/,
    ],
  },
];
