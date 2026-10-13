import { describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { GitHubCiArtifacts } from '../src/adapters/github/ci-artifacts.js';
import { ciFixture, CI_BASE, CI_HEAD } from './helpers/ci.js';
describe('authenticated GitHub CI artifact adapter', () => {
  function fixture(options: { fork?: boolean; storage?: string; runId?: number; expired?: boolean } = {}) {
    const merge = 'd'.repeat(40), value = ciFixture(), storage = options.storage ?? 'https://fixtures.blob.core.windows.net/result.zip';
    const fetcher = vi.fn<typeof fetch>(async (input, _init) => {
      const url = String(input), json = (body: unknown) => new Response(JSON.stringify(body));
      if (url === storage) return new Response(Buffer.from(zipSync({ 'devdigest-result.json': strToU8(JSON.stringify(value.artifact)) })));
      if (url.endsWith('/actions/artifacts/90/zip')) return new Response(null, { status: 302, headers: { location: storage } });
      if (url.endsWith('/actions/runs/17/artifacts?per_page=100')) return json({ artifacts: [{ id: 90, name: 'devdigest-result', expired: options.expired ?? false, size_in_bytes: 300, workflow_run: { id: options.runId ?? 17, repository_id: 42, head_sha: merge } }] });
      if (url.endsWith('/actions/runs/17')) return json({ id: 17, run_attempt: 1, repository: { id: 42 }, event: 'pull_request', status: 'completed', path: '.github/workflows/devdigest-review.yml', head_sha: merge, html_url: value.envelope.htmlUrl, created_at: value.envelope.createdAt,
        pull_requests: [{ number: 7, head: { sha: CI_HEAD, repo: { id: options.fork ? 99 : 42 } }, base: { sha: CI_BASE, repo: { id: 42 } } }] });
      if (url.includes('/contents/.github/workflows/')) { expect(url).toContain(`ref=${merge}`); return json({ content: Buffer.from(value.envelope.workflow).toString('base64'), encoding: 'base64' }); }
      if (url.includes('/contents/.devdigest/')) { expect(url).toContain(`ref=${CI_BASE}`); return json({ content: Buffer.from('fixture runner').toString('base64'), encoding: 'base64', size: 14 }); }
      if (url.endsWith('/repos/fixture/ci')) return json({ id: 42, full_name: 'fixture/ci' });
      throw new Error(`Unexpected fixture URL ${url}`);
    });
    return { fetcher, value, adapter: new GitHubCiArtifacts('fixture-token-not-real', fetcher) };
  }
  it('retrieves authenticated metadata, strips bearer token on storage redirect and verifies actual execution revision', async () => {
    const f = fixture(), envelope = await f.adapter.retrieve('fixture/ci', 17, ['.devdigest/runner/index.js']);
    expect(envelope).toMatchObject({ repositoryId: 42, headSha: CI_HEAD, workflowSha: CI_BASE, artifact: f.value.artifact, trustedFileDigests: f.value.installation.bundleDigests });
    const storageCall = f.fetcher.mock.calls.find(call => String(call[0]).includes('blob.core.windows.net'))!;
    expect(storageCall[1]?.headers).toBeUndefined(); expect(f.fetcher.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer fixture-token-not-real' });
  });
  it.each([{ fork: true }, { runId: 999 }, { expired: true }, { storage: 'https://attacker.example/result.zip' }])('rejects foreign fork, mismatched origin, expired artifacts or untrusted redirects %#', async options => {
    await expect(fixture(options).adapter.retrieve('fixture/ci', 17, ['.devdigest/runner/index.js'])).rejects.toThrow();
  });
  it('requires authentication and safe identity before outbound reads', async () => {
    const fetcher = vi.fn(); await expect(new GitHubCiArtifacts('', fetcher).retrieve('fixture/ci', 17, [])).rejects.toThrow('GITHUB_TOKEN'); expect(fetcher).not.toHaveBeenCalled();
    await expect(new GitHubCiArtifacts('fixture', fetcher).retrieve('../escape', 17, [])).rejects.toThrow('identity'); expect(fetcher).not.toHaveBeenCalled();
  });
});
