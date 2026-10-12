import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { AppError } from '../../platform/errors.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  try {
    const diff = await container.git.diff(
      { owner: repoRow.owner, name: repoRow.name },
      pull.base,
      pull.headSha,
    );
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  const persisted = await diffFromPrFiles(repo, pull.id);
  if (persisted.files.length > 0) return persisted;
  // A PR imported from the list may not have its patches stored yet. Read
  // public GitHub detail before concluding that there is nothing to review.
  const gh = await container.github();
  const detail = await gh.getPullRequest({ owner: repoRow.owner, name: repoRow.name }, pull.number);
  const raw = detail.files.filter(file => file.patch).map(file =>
    `diff --git a/${file.path} b/${file.path}\n--- a/${file.path}\n+++ b/${file.path}\n${file.patch}`,
  ).join('\n');
  const remote = parseUnifiedDiff(raw);
  if (!remote.files.length) throw new AppError('empty_review_diff', 'No text changes available to review', 409);
  return remote;
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
