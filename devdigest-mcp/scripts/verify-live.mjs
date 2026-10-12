import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { deepStrictEqual, equal } from 'node:assert';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const prId = process.argv[2];
const emptyId = process.argv[3];
const output = process.argv[4];
if (!prId || !emptyId || !output) throw new Error('Usage: node scripts/verify-live.mjs <pr_uuid> <empty_pr_uuid> <output.json>');
const base = process.env.DEVDIGEST_API_URL ?? 'http://127.0.0.1:3001';
const client = new Client({ name: 'devdigest-l04-verifier', version: '0.1.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [resolve('dist/index.js')], env: { DEVDIGEST_API_URL: base }, stderr: 'pipe' });
try {
  await client.connect(transport);
  const catalog = await client.listTools();
  const tool = catalog.tools.find(t => t.name === 'get_blast_radius');
  equal(tool.annotations.readOnlyHint, true);
  const route = await (await fetch(`${base}/pulls/${prId}/blast`)).json();
  const mcp = await client.callTool({ name: 'get_blast_radius', arguments: { pr_id: prId } });
  deepStrictEqual(mcp.structuredContent, route);
  deepStrictEqual(JSON.parse(mcp.content[0].text), route);
  const empty = await client.callTool({ name: 'get_blast_radius', arguments: { pr_id: emptyId } });
  equal(empty.structuredContent.counts.callers, 0);
  const missing = await client.callTool({ name: 'get_blast_radius', arguments: { pr_id: '00000000-0000-4000-8000-000000000001' } });
  equal(missing.isError, true);
  await writeFile(output, JSON.stringify({ transport: 'real stdio SDK handshake/listTools/callTool',
    http_mcp_equal: true, tool, route, mcp, empty, missing }, null, 2));
  console.log(JSON.stringify({ handshake: true, readOnlyHint: true, http_mcp_equal: true,
    counts: route.counts, indexed_sha: route.indexed_sha, empty_callers: 0, missing_pr_isError: true }));
} finally { await client.close(); }
