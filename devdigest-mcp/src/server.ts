import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BlastDocument } from './wire.js';

export const PrId = z.string().uuid();

/** Config is operator-owned. The tool cannot choose a destination or arbitrary URL. */
export function apiBase(value = process.env.DEVDIGEST_API_URL ?? 'http://127.0.0.1:3001'): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('DEVDIGEST_API_URL must be an HTTP(S) base URL without credentials, query or fragment.');
  }
  return url.href.replace(/\/$/, '');
}

export async function getBlastRadius(prId: string, base: string, fetcher = fetch) {
  PrId.parse(prId);
  try {
    const response = await fetcher(`${base}/pulls/${encodeURIComponent(prId)}/blast`, {
      method: 'GET', signal: AbortSignal.timeout(10_000), redirect: 'error',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      const message = response.status === 404
        ? 'Pull request not found in the current workspace. Use its local DevDigest UUID, not the GitHub PR number.'
        : `DevDigest returned HTTP ${response.status}. Check that the API is running and the PR is accessible.`;
      return { isError: true, content: [{ type: 'text' as const, text: message }] };
    }
    let data: unknown;
    try { data = await response.json(); } catch {
      return { isError: true, content: [{ type: 'text' as const, text: 'DevDigest returned invalid Blast Radius JSON. Check that the API version supports GET /pulls/:id/blast.' }] };
    }
    if (!BlastDocument.safeParse(data).success) {
      return { isError: true, content: [{ type: 'text' as const, text: 'DevDigest returned an invalid Blast Radius document. Update the API and retry.' }] };
    }
    // Return the identical route document, including degradation and snapshot metadata.
    return { structuredContent: data as Record<string, unknown>, content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
  } catch {
    return { isError: true, content: [{ type: 'text' as const,
      text: 'Could not read DevDigest. Start the API and check DEVDIGEST_API_URL; the request may have timed out.' }] };
  }
}

export function createServer(base = apiBase(), fetcher = fetch): McpServer {
  const server = new McpServer({ name: 'devdigest-mcp', version: '0.1.0' });
  server.registerTool('get_blast_radius', {
    description: 'Read the cached impact map when reviewing a DevDigest PR: changed symbols, callers, endpoints, crons and index limitations. Does not run review or rebuild the index.',
    inputSchema: z.object({ pr_id: PrId.describe('Local DevDigest pull-request UUID from GET /repos/:repoId/pulls, not a GitHub number.') }),
    outputSchema: BlastDocument,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ pr_id }) => getBlastRadius(pr_id, base, fetcher));
  return server;
}
