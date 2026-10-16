// Trusted fixed stdio MCP. No arbitrary command, environment, URL, write or absolute-path tool.
import { createInterface } from 'node:readline';
import { readFile, lstat, realpath, open } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
const [snapshotArg, manifestArg] = process.argv.slice(2);
// Authentication belongs to the parent CLI, never to this data-only tool.
for (const key of Object.keys(process.env)) delete process.env[key];
const root = await realpath(snapshotArg);
const raw = await readFile(manifestArg, 'utf8'); if (raw.length > 131072) throw new Error('Manifest limit');
const manifest = JSON.parse(raw).files;
if (!Array.isArray(manifest) || manifest.length > 64) throw new Error('Invalid manifest');
const canonical = path => typeof path === 'string' && path.length > 0 && path.length <= 1024 && !/[\\:\x00-\x1f\x7f]/.test(path) && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part));
async function readDocument(path) {
  if (!canonical(path)) throw new Error('Canonical relative path required');
  const entry = manifest.find(file => file.staged === path); if (!entry) throw new Error('Document not in staged allowlist');
  let target = root;
  for (const part of path.split('/')) { target = join(target, part); const stat = await lstat(target); if (stat.isSymbolicLink()) throw new Error('Linked ancestor refused'); }
  const real = await realpath(target), rel = relative(root, real);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).join('/') !== path) throw new Error('Unsafe document');
  const stat = await lstat(real); if (!stat.isFile() || stat.size > 131072) throw new Error('Document byte limit');
  const handle = await open(real, 'r'); let bytes;
  try { const buffer = Buffer.alloc(131073); let count = 0; while (count < buffer.length) { const read = await handle.read(buffer, count, buffer.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; } if (count > 131072) throw new Error('Document byte limit'); bytes = buffer.subarray(0, count); }
  finally { await handle.close(); }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== entry.sha256 || bytes.length !== entry.bytes) throw new Error('Staged document changed');
  return { path, source: entry.source, sha256, bytes: bytes.length, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}
const tools = [
  { name: 'list_documents', description: 'List only the host-approved staged repository documents; no arbitrary filesystem enumeration.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'read_document', description: 'Read one whole allowlisted staged document, returning its source identity, SHA-256, byte count and content.', inputSchema: { type: 'object', properties: { path: { type: 'string', maxLength: 1024 } }, required: ['path'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
];
let requests = 0;
async function respond(request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error('Invalid JSON-RPC');
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize') result = { protocolVersion: request.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'devdigest-eval-files', version: '1.0.0' }, instructions: 'Only staged repository document list/read is available. No writes, commands, network or environment access.' };
  else if (request.method === 'ping') result = {};
  else if (request.method === 'tools/list') result = { tools };
  else if (request.method === 'tools/call') {
    const { name, arguments: args = {} } = request.params ?? {};
    let value;
    if (name === 'list_documents' && Object.keys(args).length === 0) value = { documents: manifest.map(file => ({ path: file.staged, source: file.source, bytes: file.bytes })) };
    else if (name === 'read_document' && Object.keys(args).length === 1 && typeof args.path === 'string') value = await readDocument(args.path);
    else throw new Error('Unsupported tool or arguments');
    result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false };
  } else throw new Error('Unsupported method');
  console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
}
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (++requests > 256 || Buffer.byteLength(line) > 32768) { process.exitCode = 1; break; }
  let request;
  try { request = JSON.parse(line); await respond(request); }
  catch { if (request?.id !== undefined) console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'Request rejected: unsupported method, unsafe path or unavailable staged document' } })); }
}
