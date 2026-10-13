import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { LLMProvider, GitHubReviewPayload, CiResultArtifact } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers, wrapUntrusted } from '@devdigest/reviewer-core';
import { VerifiedCiArtifact, RunTrace } from '@devdigest/shared';
import { createHash } from 'node:crypto';
import { loadMemory } from './memory.js';
import zodPackage from 'zod/package.json';
import yamlPackage from 'yaml/package.json';
import corePackage from '../../reviewer-core/package.json';
import { loadManifest } from './manifest.js';
import { loadSkillBodies } from './skills.js';
import { resolvePrContext, type CiEnv } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildResultArtifact } from './artifact.js';
import { RunnerError } from './errors.js';

/**
 * `runCi` — the runner's single orchestration entry point (T8). Mirrors the
 * pipeline a local studio review runs (assemblePrompt/wrapUntrusted →
 * completeStructured → groundFindings, all INSIDE `reviewPullRequest`) so CI
 * and local stay in parity (AC-36): this file never re-implements or
 * hand-rolls any of that — it only resolves CI-specific inputs (manifest,
 * skills, diff, PR context) and hands them to the SAME reviewer-core engine
 * the studio calls, then turns the grounded result into GitHub side effects.
 *
 * Deterministic gate (AC-23): the GitHub review event + blocker count are
 * computed from `countBlockers`/`gateTriggered` + the manifest's `ci_fail_on`
 * against the GROUNDED findings — never from `review.verdict` (the model's
 * self-report), which is discarded here on purpose.
 *
 * Hard-fail (Q5): a single try/catch wraps the ENTIRE pipeline. Any failure —
 * invalid manifest (AC-20), missing skill file, unresolvable CI context,
 * diff-fetch failure, or an LLM/model-call error inside `reviewPullRequest` —
 * short-circuits to `{ exitCode: 1, artifact: null, posted: null }` before any
 * GitHub post or artifact write. Do not add per-stage catches that post partial
 * state; the whole point is that a failure anywhere upstream of "we have a
 * grounded review" produces NOTHING (no synthetic review skeleton).
 */

export type PostAs = 'github_review' | 'pr_comment' | 'none';

export interface RunCiDeps {
  /** Directory containing `agents/` and `skills/` (checked-in `.devdigest/`). */
  devdigestDir: string;
  env: CiEnv;
  /** Injected hosted runtime: OpenRouter or CI-only loopback Ollama. */
  llm: LLMProvider;
  /** How to post the result — `'github_review' | 'pr_comment' | 'none'` (AC-24). */
  postAs: PostAs;
  /** Absolute path to write the `CiResultArtifact` JSON to. */
  resultPath: string;
  fetchImpl?: FetchLike;
  readFile?: typeof readFileSync;
  readDir?: typeof readdirSync;
  writeFile?: typeof writeFileSync;
  now?: () => number;
  /**
   * Override diff retrieval (tests supply a fixture diff directly instead of
   * hitting the GitHub API). Defaults to `fetchPrDiff` via the GitHub REST API.
   */
  fetchDiff?: (
    ctx: { owner: string; repo: string; prNumber: number },
    token: string,
    fetchImpl: FetchLike,
  ) => Promise<string>;
  /** Production snapshots bracket diff retrieval; a moving head is rejected. */
  fetchIdentity?: () => Promise<{ headSha: string; repositoryId: number; title: string; body: string; fork: boolean }>;
}

export interface RunCiSuccess {
  exitCode: number;
  artifact: CiResultArtifact;
  posted: { kind: PostAs; payload?: GitHubReviewPayload };
  blockers: number;
  gateTriggered: boolean;
  error?: undefined;
}

export interface RunCiFailure {
  exitCode: number;
  artifact: null;
  posted: null;
  blockers?: undefined;
  gateTriggered?: undefined;
  error: string;
}

export type RunCiResult = RunCiSuccess | RunCiFailure;

export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const readFile = deps.readFile ?? readFileSync;
  const readDir = deps.readDir ?? readdirSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchDiffImpl = deps.fetchDiff ?? fetchPrDiff;

  try {
    // 1. Load + validate the manifest BEFORE it is used for anything (AC-20).
    const manifest = loadManifest(deps.devdigestDir, { readFile, readDir }, deps.env.DEVDIGEST_MANIFEST);
    if (manifest.provider !== deps.llm.id) throw new RunnerError('Manifest provider differs from the injected CI runtime');
    const skills = loadSkillBodies(deps.devdigestDir, manifest.skills, readFile);

    // 2. Resolve CI context (PR number/title/body/repo) from env + event payload.
    const ctx = resolvePrContext(deps.env, readFile);
    const identity = await deps.fetchIdentity?.();
    if (identity && (!ctx.headSha || identity.headSha !== ctx.headSha)) throw new RunnerError('PR head differs from the triggering event; run the workflow for the current head');
    if (identity?.fork || ctx.isFork) throw new RunnerError('Fork reviews are disabled in the write-capable CI job');
    if (identity) { ctx.title = identity.title; ctx.body = identity.body; }

    const githubToken = deps.env.GITHUB_TOKEN;
    if (deps.postAs !== 'none' && !githubToken) {
      throw new RunnerError(`GITHUB_TOKEN is required to post as '${deps.postAs}'`);
    }

    // 3. Assemble the diff from the CI context. Strip DevDigest's own exported
    //    artifacts (`.devdigest/**`, the generated workflow) BEFORE parse: the
    //    minified runner bundle would otherwise fail the whole review with a
    //    GitHub 422 "diff too large", and reviewing our own config is noise.
    const rawDiff = await fetchDiffImpl(ctx, githubToken ?? '', fetchImpl);
    if (identity && (await deps.fetchIdentity!()).headSha !== identity.headSha) throw new RunnerError('PR head changed during diff capture; retry the workflow');
    const diff = parseUnifiedDiff(stripIgnoredFiles(rawDiff));

    // 4. Run the SAME engine the studio uses. `reviewPullRequest` internally
    //    calls `assemblePrompt`/`wrapUntrusted` (diff → `<untrusted
    //    source="diff">`, prDescription → `<untrusted source="pr-description">`,
    //    AC-21) and the mandatory `groundFindings()` gate (AC-22: an all-dropped
    //    result is a valid zero-finding review, not an error — it flows through
    //    normally below).
    const start = now();
    const outcome = await reviewPullRequest({
      systemPrompt: manifest.system_prompt,
      model: manifest.model,
      diff,
      llm: deps.llm,
      strategy: manifest.strategy,
      skills,
      memory: loadMemory(deps.devdigestDir),
      prDescription: ctx.body,
      task: `Review PR #${ctx.prNumber}\n${wrapUntrusted('pr-title', ctx.title)}`,
      maxRetries: 0,
    });
    const durationMs = now() - start;

    // 5. Deterministic verdict/gate from GROUNDED findings + `ci_fail_on`
    //    (AC-23) — never `outcome.review.verdict`.
    const payload = toReviewPayload(outcome.review, {
      failOn: manifest.ci_fail_on,
      diff,
      title: manifest.name,
    });
    const blockers = countBlockers(outcome.review.findings, manifest.ci_fail_on);
    const triggered = gateTriggered(outcome.review.findings, manifest.ci_fail_on);

    // 6. Build + write the artifact before posting, so a GitHub-side posting
    //    failure never loses the already-computed, already-grounded result.
    let artifact = buildResultArtifact({
      findings: outcome.review.findings,
      costUsd: outcome.costUsd,
      durationMs,
      agent: manifest.name,
      prNumber: ctx.prNumber,
    });
    if (identity) {
      const trace = RunTrace.parse({ source_diff: diff.raw, source_head_sha: identity.headSha,
        source_pr: { title: ctx.title, description: ctx.body },
        config: { agent: manifest.name, version: String(manifest.agent_version), provider: manifest.provider, model: manifest.model, pr: ctx.prNumber, source: 'ci' },
        stats: { duration_ms: durationMs, tokens_in: outcome.tokensIn, tokens_out: outcome.tokensOut, cost_usd: outcome.costUsd, findings: outcome.review.findings.length, grounding: outcome.grounding },
        prompt_assembly: outcome.assembly, tool_calls: [], raw_output: outcome.raw, memory_pulled: [], specs_read: [], log: [] });
      const verified = VerifiedCiArtifact.parse({ schema_version: '2', agent_id: manifest.agent_id, agent: manifest.name, agent_version: manifest.agent_version,
        manifest_digest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), provider: manifest.provider, model: manifest.model, version: '2',
        dependency_versions: { 'reviewer-core': corePackage.version, zod: zodPackage.version, yaml: yamlPackage.version, node: process.versions.node, ollama: manifest.provider === 'ollama' ? '0.6.8' : 'unused' },
        repo: `${ctx.owner}/${ctx.repo}`, repository_id: identity.repositoryId, pr_number: ctx.prNumber, head_sha: identity.headSha,
        workflow_sha: deps.env.DEVDIGEST_WORKFLOW_SHA, workflow_path: '.github/workflows/devdigest-review.yml',
        github_run_id: Number(deps.env.GITHUB_RUN_ID), github_run_attempt: Number(deps.env.GITHUB_RUN_ATTEMPT), github_job: deps.env.GITHUB_JOB,
        verdict: triggered ? 'request_changes' : outcome.review.findings.length ? 'comment' : 'approve', fail_on: manifest.ci_fail_on,
        findings: outcome.review.findings, findings_count: outcome.review.findings.length, cost_usd: outcome.costUsd, duration_ms: durationMs,
        tokens_in: outcome.tokensIn, tokens_out: outcome.tokensOut, trace });
      artifact = verified;
    }
    writeFile(deps.resultPath, `${JSON.stringify(artifact, null, 2)}\n`);

    // 7. Post per `post_as` (AC-24).
    if (identity && (await deps.fetchIdentity!()).headSha !== identity.headSha) throw new RunnerError('PR head changed during inference; refusing stale publication');
    if (deps.postAs === 'github_review') {
      await postGithubReview(ctx, githubToken as string, payload, fetchImpl, identity?.headSha);
    } else if (deps.postAs === 'pr_comment') {
      await postPrComment(ctx, githubToken as string, payload.body, fetchImpl);
    }
    // 'none' → post nothing (exit-code only).

    // 8. Exit non-zero IFF the gate triggered REQUEST_CHANGES (AC-25).
    return {
      exitCode: triggered ? 1 : 0,
      artifact,
      posted: { kind: deps.postAs, payload },
      blockers,
      gateTriggered: triggered,
    };
  } catch (err) {
    // Hard-fail (Q5): non-zero exit, nothing posted, no artifact, no synthetic
    // review skeleton — regardless of which stage above threw.
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, artifact: null, posted: null, error: message };
  }
}
