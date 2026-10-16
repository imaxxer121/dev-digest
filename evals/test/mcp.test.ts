import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, symlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PACKAGE_ROOT } from '../src/paths.js';
import { capture, subscriptionEnv } from '../src/runtime.js';
import { digest } from '../src/stage.js';
import { parseTrace } from '../src/trace.js';

test('fixed stdio MCP exposes only scoped list/read, rejects arbitrary data/tool/env requests and produces verifiable read events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eval-mcp-'));
  try {
    await mkdir(join(root, 'snapshot/docs'), { recursive: true }); const snapshot = join(root, 'snapshot');
    const content = 'Whole staged invariant'; await writeFile(join(snapshot, 'docs/a.md'), content);
    await writeFile(join(root, 'outside.env'), 'NEVER_RETURN_SECRET');
    const entry = { source: 'docs/a.md', staged: 'docs/a.md', sha256: digest(content), bytes: Buffer.byteLength(content) };
    const manifest = join(root, 'manifest.json'); await writeFile(manifest, JSON.stringify({ files: [entry] }));
    const call = (id: number, name: string, args: object) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    const requests = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      call(3, 'list_documents', {}), call(4, 'read_document', { path: 'docs/a.md' }),
      call(5, 'read_document', { path: '../outside.env' }), call(6, 'read_document', { path: join(root, 'outside.env') }),
      call(7, 'read_document', { path: 'docs/unlisted.md' }), call(8, 'write_document', { path: 'docs/a.md', body: 'overwrite' }),
      call(9, 'environment', {}), call(10, 'read_document', { path: 'docs/a.md', env: true })];
    const run = await capture(process.execPath, [join(PACKAGE_ROOT, 'assets/files-mcp.mjs'), snapshot, manifest], { cwd: snapshot,
      env: { ...subscriptionEnv(), OPENAI_API_KEY: 'NEVER_RETURN_API_KEY' }, input: requests.map(request => JSON.stringify(request)).join('\n') + '\n', timeoutMs: 2000 });
    assert.equal(run.code, 0); const responses = run.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.equal(responses.length, 10); assert.deepEqual(responses.find(r => r.id === 2).result.tools.map((tool: any) => tool.name), ['list_documents', 'read_document']);
    assert.equal(responses.find(r => r.id === 4).result.structuredContent.content, content);
    for (const id of [5, 6, 7, 8, 9, 10]) assert.ok(responses.find(r => r.id === id).error);
    assert.ok(!run.stdout.includes('NEVER_RETURN'));
    const event = { type: 'item.completed', item: { id: 'actual-tool', type: 'mcp_tool_call', server: 'eval_files', tool: 'read_document', arguments: { path: 'docs/a.md' }, status: 'completed', result: responses.find(r => r.id === 4).result } };
    const trace = parseTrace(JSON.stringify(event), [entry]); assert.equal(trace.reads[0]?.method, 'verified_mcp_read'); assert.equal(trace.reads[0]?.path, 'docs/a.md');
    event.item.arguments.path = 'docs/forged.md'; assert.equal(parseTrace(JSON.stringify(event), [entry]).reads.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('MCP rechecks staged byte identity and refuses a replaced junction ancestor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eval-mcp-link-'));
  try {
    const snapshot = join(root, 'snapshot'); await mkdir(join(snapshot, 'docs'), { recursive: true });
    const content = 'original'; await writeFile(join(snapshot, 'docs/a.md'), content);
    const manifest = join(root, 'manifest.json'); await writeFile(manifest, JSON.stringify({ files: [{ source: 'docs/a.md', staged: 'docs/a.md', sha256: digest(content), bytes: Buffer.byteLength(content) }] }));
    const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_document', arguments: { path: 'docs/a.md' } } }) + '\n';
    await writeFile(join(snapshot, 'docs/a.md'), 'changed');
    const changed = await capture(process.execPath, [join(PACKAGE_ROOT, 'assets/files-mcp.mjs'), snapshot, manifest], { cwd: snapshot, env: subscriptionEnv(), input, timeoutMs: 2000 });
    assert.ok(JSON.parse(changed.stdout).error);
    await rename(join(snapshot, 'docs'), join(snapshot, 'previous'));
    await symlink(join(snapshot, 'previous'), join(snapshot, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
    const linked = await capture(process.execPath, [join(PACKAGE_ROOT, 'assets/files-mcp.mjs'), snapshot, manifest], { cwd: snapshot, env: subscriptionEnv(), input, timeoutMs: 2000 });
    assert.ok(JSON.parse(linked.stdout).error);
  } finally { await rm(root, { recursive: true, force: true }); }
});
