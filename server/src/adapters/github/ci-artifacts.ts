import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import type { CiGithubPort, CiArtifactEnvelope } from '../../modules/ci/ports.js';
import { ConfigError, ExternalServiceError, ValidationError } from '../../platform/errors.js';

/** Authenticated REST retrieval with metadata from GitHub, never supplied by the client. */
export class GitHubCiArtifacts implements CiGithubPort {
  constructor(private token: string, private fetchImpl: typeof fetch = fetch) {}
  private async request(path: string) {
    if (!this.token) throw new ConfigError('GITHUB_TOKEN is required to retrieve GitHub Actions artifacts');
    const response = await this.fetchImpl(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new ExternalServiceError(`GitHub Actions request failed (${response.status})`);
    return response;
  }
  async retrieve(repo: string, runId: number, paths: string[]): Promise<CiArtifactEnvelope> {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.\.?$)[A-Za-z0-9_.-]{1,100}$/.test(repo) || !Number.isSafeInteger(runId) || runId <= 0) throw new ValidationError('Invalid CI identity');
    const prefix = `/repos/${repo}`;
    const metadata = await (await this.request(prefix)).json() as { id: number; full_name: string };
    const run = await (await this.request(`${prefix}/actions/runs/${runId}`)).json() as {
      id: number; run_attempt: number; event: string; status: string; path: string; head_sha: string; repository: { id: number }; html_url: string; created_at: string;
      pull_requests: { number: number; head: { sha: string; repo: { id: number } }; base: { sha: string; repo: { id: number } } }[];
    };
    const pr = run.pull_requests?.[0];
    if (run.pull_requests?.length !== 1 || !pr || run.repository.id !== metadata.id || pr.head.repo.id !== metadata.id || pr.base.repo.id !== metadata.id) throw new ValidationError('CI run must belong to one same-repository pull request');
    const listing = await (await this.request(`${prefix}/actions/runs/${runId}/artifacts?per_page=100`)).json() as { artifacts: { id: number; name: string; expired: boolean; size_in_bytes: number; workflow_run?: { id: number; repository_id: number; head_sha: string } }[] };
    const matches = listing.artifacts.filter(row => row.name === 'devdigest-result' && !row.expired);
    if (matches.length !== 1) throw new ValidationError('Expected exactly one non-expired devdigest-result artifact');
    const file = matches[0]!;
    if (file.size_in_bytes > 8_000_000 || file.workflow_run?.id !== run.id || file.workflow_run.repository_id !== metadata.id || file.workflow_run.head_sha !== run.head_sha) throw new ValidationError('Artifact origin or size is invalid');
    // Fetch deliberately starts on GitHub's authenticated endpoint. Redirects
    // use a fresh unauthenticated request, so bearer tokens never reach storage.
    let response = await this.fetchImpl(`https://api.github.com${prefix}/actions/artifacts/${file.id}/zip`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json' }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status === 302) {
      const url = new URL(response.headers.get('location') ?? '');
      if (url.protocol !== 'https:' || !(url.hostname.endsWith('.blob.core.windows.net') || url.hostname.endsWith('.actions.githubusercontent.com') || url.hostname.endsWith('.githubusercontent.com'))) throw new ValidationError('Unexpected artifact storage host');
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
    }
    if (!response.ok) throw new ExternalServiceError(`Artifact download failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 8_000_000) throw new ValidationError('Artifact ZIP is too large');
    const archive = unzipSync(bytes, { filter: entry => entry.name === 'devdigest-result.json' && entry.originalSize <= 4_000_000 });
    const json = archive['devdigest-result.json'];
    if (!json || json.length > 4_000_000) throw new ValidationError('Artifact result is missing or oversized');
    // The workflow that actually ran is from the merge/head revision. Checking
    // the base copy alone would let a PR replace its workflow and forge JSON.
    const content = await (await this.request(`${prefix}/contents/.github/workflows/devdigest-review.yml?ref=${run.head_sha}`)).json() as { content: string; encoding: string };
    if (content.encoding !== 'base64') throw new ValidationError('Invalid workflow encoding');
    const trustedFileDigests: Record<string, string> = {};
    if (paths.length > 150 || paths.some(path => path.split('/').some(part => part === '..' || part === '.') || !/^\.devdigest\/(?:runner|agents|skills)\/[a-zA-Z0-9_.-]+$/.test(path) && path !== '.devdigest/memory.jsonl')) throw new ValidationError('Invalid installation file paths');
    for (const path of paths) {
      const file = await (await this.request(`${prefix}/contents/${path}?ref=${pr.base.sha}`)).json() as { sha: string; content: string; encoding: string; size: number };
      if (file.size > 12_000_000) throw new ValidationError('Trusted base file is oversized');
      const blob = file.encoding === 'base64' ? file : await (await this.request(`${prefix}/git/blobs/${file.sha}`)).json() as { content: string; encoding: string };
      if (blob.encoding !== 'base64') throw new ValidationError('Invalid trusted file encoding');
      trustedFileDigests[path] = createHash('sha256').update(Buffer.from(blob.content, 'base64')).digest('hex');
    }
    return { runId: run.id, attempt: run.run_attempt, repositoryId: metadata.id, repo: metadata.full_name, event: run.event, status: run.status,
      workflowPath: run.path, workflowSha: pr.base.sha, headSha: pr.head.sha, prNumber: pr.number,
      workflow: Buffer.from(content.content, 'base64').toString('utf8'), artifact: JSON.parse(strFromU8(json)), htmlUrl: run.html_url, createdAt: run.created_at, trustedFileDigests };
  }
}
