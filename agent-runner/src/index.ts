/**
 * @devdigest/agent-runner — CI runner CLI (T8).
 *
 * Invoked by the generated GitHub Actions workflow as
 * `node .devdigest/runner/index.js` (`server/src/modules/ci/constants.ts` /
 * `workflow.ts`) — bundled by `ncc` into `dist/index.js` plus emitted runtime
 * chunks, with no dependency on `node_modules/@devdigest/*` in the target repo.
 *
 * Reads CI-injected env vars directly (OPENROUTER_API_KEY, GITHUB_TOKEN,
 * GITHUB_REPOSITORY, PR_NUMBER). This is intentional, not a `SecretsProvider`
 * bypass: the runner executes OUTSIDE the server DI graph (in the target
 * repo's own CI), so the `SecretsProvider`/`process.env` chokepoint — which is
 * scoped to `server/` — does not apply here (see `agent-runner/CLAUDE.md`).
 *
 * All actual logic lives in `run.ts` (`runCi`), which takes every dependency
 * (fs, fetch, LLM provider, clock) as an injectable parameter so it can be
 * unit-tested hermetically. This file only wires those dependencies to the
 * real world and maps the result onto `process.exitCode`.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { runCi, type PostAs } from './run.js';
import { loadManifest } from './manifest.js';
import { resolvePrContext } from './context.js';
import { OllamaProvider } from './ollama.js';

function resolvePostAs(value: string | undefined): PostAs {
  if (value === 'github_review' || value === 'pr_comment' || value === 'none') return value;
  return 'github_review';
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const devdigestDir = env.DEVDIGEST_DIR ?? path.join(process.cwd(), '.devdigest');
  const resultPath = env.DEVDIGEST_RESULT_PATH ?? path.join(process.cwd(), 'devdigest-result.json');
  const postAs = resolvePostAs(env.DEVDIGEST_POST_AS);

  // The validated manifest selects an explicit CI runtime. Studio subscription
  // credentials are never exported; OpenRouter requires its own CI secret.
  const manifest = loadManifest(devdigestDir, {}, env.DEVDIGEST_MANIFEST);
  if (!manifest.agent_id) throw new Error('CI manifest must carry its studio agent_id');
  if (manifest.provider === 'openrouter' && !env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required for this CI runtime');
  const llm = manifest.provider === 'ollama' ? new OllamaProvider() : new OpenRouterProvider(env.OPENROUTER_API_KEY!);
  const ctx = resolvePrContext(env);
  const fetchIdentity = async () => {
    const response = await fetch(`https://api.github.com/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}`, {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`PR identity retrieval failed (${response.status})`);
    const pr = await response.json() as { title: string; body: string | null; head: { sha: string; repo: { id: number } }; base: { repo: { id: number } } };
    return { headSha: pr.head.sha, repositoryId: pr.base.repo.id, title: pr.title, body: pr.body ?? '', fork: pr.head.repo.id !== pr.base.repo.id };
  };

  const result = await runCi({
    devdigestDir,
    env,
    llm,
    fetchIdentity,
    postAs,
    resultPath,
    readFile: readFileSync,
    readDir: readdirSync,
    writeFile: writeFileSync,
  });

  if (result.artifact === null) {
    console.error(`[agent-runner] FAILED: ${result.error}`);
  } else {
    console.log(
      `[agent-runner] findings=${result.artifact.findings_count} blockers=${result.blockers} ` +
        `gateTriggered=${result.gateTriggered} posted=${result.posted.kind}`,
    );
  }
  return result.exitCode;
}

// Only run when executed directly (CI), never on import (tests import `main`
// / `runCi` directly and drive them with injected fixtures).
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error('[agent-runner] fatal error:', err);
      process.exitCode = 1;
    },
  );
}
