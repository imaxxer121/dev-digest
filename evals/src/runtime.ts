import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { writeFile, readFile, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { HarnessCase, IsolationMode } from './types.js';
import { ANSWER_SCHEMA } from './scoring.js';
import { PACKAGE_ROOT } from './paths.js';

/** Only host runtime essentials reach the CLI. Auth remains the CLI's own login. */
export function subscriptionEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'CODEX_HOME', 'LANG', 'LC_ALL']);
  for (const [key, value] of Object.entries(source)) if (allowed.has(key.toUpperCase()) && value !== undefined) env[key] = value;
  return env;
}
export function modelEnv(snapshot: string, source: NodeJS.ProcessEnv = process.env) {
  const parent = subscriptionEnv(source), env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) if (['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'LANG', 'LC_ALL'].includes(key.toUpperCase()) && value) env[key] = value;
  env.HOME = join(snapshot, '.harness/home'); env.USERPROFILE = env.HOME; env.CODEX_HOME = env.HOME;
  env.TEMP = env.HOME; env.TMP = env.HOME; env.TMPDIR = env.HOME;
  return env;
}
const tomlMap = (map: Record<string, string>) => `{${Object.entries(map).map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`).join(',')}}`;
export function sandboxArgs(snapshot: string, isolation: IsolationMode = 'strict'): string[] {
  const windowsBackend = process.env.EVAL_WINDOWS_SANDBOX ?? 'elevated';
  if (!['elevated', 'mxc'].includes(windowsBackend)) throw new Error('EVAL_WINDOWS_SANDBOX must be elevated or mxc; no weaker fallback');
  // Windows legacy backend requires root-read. The model has no shell/image
  // reader: its only file data surface is the fixed manifest-scoped MCP below.
  const filesystem = process.platform === 'win32' && isolation === 'mcp-readonly' ? '{":root"="read"}' : '{":minimal"="read",":workspace_roots"="read"}';
  return ['-c', 'default_permissions="eval_read"', '-c', `permissions.eval_read.filesystem=${filesystem}`,
    '-c', 'permissions.eval_read.network.enabled=false', '-c', 'approval_policy="never"',
    '-c', 'shell_environment_policy.inherit="none"', '-c', 'shell_environment_policy.experimental_use_profile=false',
    '-c', 'shell_environment_policy.ignore_default_excludes=false', '-c', `shell_environment_policy.set=${tomlMap(modelEnv(snapshot))}`,
    ...(process.platform === 'win32' ? ['-c', `windows.sandbox=${JSON.stringify(windowsBackend)}`] : [])];
}
export function execArgs(c: HarnessCase, snapshot: string, model: string, output: string, schema: string, isolation: IsolationMode = 'strict'): string[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(model)) throw new Error('Set EVAL_MODEL to an exact accessible Codex model id');
  return ['--no-daemon', ...sandboxArgs(snapshot, isolation), '-c', 'web_search="disabled"',
    '-c', `projects.${JSON.stringify(snapshot)}.trust_level="trusted"`,
    ...['shell_tool', 'view_image', 'apps', 'plugins', 'remote_plugin', 'browser_use', 'computer_use', 'in_app_browser', 'hooks', 'shell_snapshot', 'request_permissions_tool', 'code_mode'].flatMap(feature => ['-c', `features.${feature}=false`]),
    // Native V8 orchestration host is required to expose the scoped MCP tools.
    // Code Mode stays disabled separately; filesystem/network permissions do not expand.
    '-c', 'features.code_mode_host=true',
    '-c', `mcp_servers.eval_files.command=${JSON.stringify(process.execPath)}`,
    '-c', `mcp_servers.eval_files.args=${JSON.stringify([join(PACKAGE_ROOT, 'assets/files-mcp.mjs'), snapshot, join(output, '..', 'manifest.json')])}`,
    '-c', 'mcp_servers.eval_files.enabled_tools=["list_documents","read_document"]',
    '-c', 'skills.bundled.enabled=false', '-c', `agents.enabled=${Boolean(c.delegate)}`, '-c', 'agents.max_concurrent_threads_per_session=1',
    // Hypothesis: a delegated child needs its parent's persisted rollout context.
    // Only the explicit delegation case retains that context; live proof is separate.
    'exec', '--ignore-user-config', '--ignore-rules', '--strict-config', ...(c.delegate ? [] : ['--ephemeral']), '--skip-git-repo-check', '--color', 'never', '--json', '-C', snapshot, '-m', model,
    '--output-schema', schema, '-o', output, '-'];
}
export interface ProcessResult { stdout: string; stderr: string; code: number | null; reason: string | null; durationMs: number }
/** Check installed feature state through a no-inference CLI command.
 * An empty child config home mirrors --ignore-user-config without copying auth.
 * This CLI rejects --strict-config on non-exec subcommands; do not claim this
 * is strict schema validation. Actual exec retains --strict-config. The feature
 * listing confirms the shell/image/Code Mode/host flags instead of trusting
 * a newer documentation schema. It performs no model request.
 */
export function configPreflightArgs(c: HarnessCase, snapshot: string, model: string, folder: string, isolation: IsolationMode = 'strict') {
  const launch = execArgs(c, snapshot, model, join(folder, 'answer.json'), join(folder, 'answer-schema.json'), isolation);
  return [...launch.slice(0, launch.indexOf('exec')), 'features', 'list'];
}
export function configFeatureState(stdout: string) {
  const is = (name: string, enabled: boolean) => new RegExp(`^${name}\\s+\\S[^\\r\\n]*\\s${enabled}\\s*$`, 'm').test(stdout);
  return { imageDisabled: is('view_image', false), shellDisabled: is('shell_tool', false),
    codeModeDisabled: is('code_mode', false), codeModeHostEnabled: is('code_mode_host', true) };
}
export async function validateCliConfig(command: string, c: HarnessCase, snapshot: string, model: string, folder: string, isolation: IsolationMode = 'strict') {
  const emptyHome = join(snapshot, '.harness/config-check-home'); await mkdir(emptyHome, { recursive: true });
  const args = configPreflightArgs(c, snapshot, model, folder, isolation);
  const result = await capture(command, args, { cwd: snapshot, env: { ...subscriptionEnv(), CODEX_HOME: emptyHome }, timeoutMs: 10000, maxBytes: 131072 });
  const state = configFeatureState(result.stdout);
  await writeFile(join(folder, 'config-preflight.json'), JSON.stringify({ evidenceKind: 'no-model-config-check', command: 'features list', validationScope: 'Installed shell/image/Code Mode disabled and orchestration host enabled feature state only; host availability and exposed live tools are not proved. Strict schema validation is supported on actual exec, not this subcommand', args, result, ...state }, null, 2));
  if (result.code !== 0 || result.reason || !Object.values(state).every(Boolean)) throw new Error('Installed Codex CLI did not confirm disabled shell/image/Code Mode and enabled orchestration host; no inference attempted. See config-preflight.json');
}
/** Error items may precede a completed turn; retain them as execution failures. */
export function runtimeItemError(raw: string): string | null {
  const messages: string[] = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let event: any; try { event = JSON.parse(line); } catch { continue; } // Trace parser separately rejects malformed streams.
    if (event?.type === 'item.completed' && event.item?.type === 'error') messages.push(typeof event.item.message === 'string' ? event.item.message : 'Unspecified completed error item');
  }
  return messages.length ? `Codex runtime error: ${messages.join('; ')}` : null;
}
/** A failed/partial process still returns its raw evidence. No shell interpolation. */
export async function capture(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; input?: string; timeoutMs: number; maxBytes?: number }): Promise<ProcessResult> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 10 || options.timeoutMs > 300000) throw new Error('Process timeout must be bounded at 300000 ms');
  const started = Date.now(), max = options.maxBytes ?? 8_388_608;
  return new Promise(resolve => {
    const stdoutChunks: Buffer[] = [], stderrChunks: Buffer[] = [];
    let bytes = 0, reason: string | null = null, settled = false;
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: 'pipe' });
    const kill = () => {
      if (process.platform === 'win32' && child.pid) { const stop = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore', env: subscriptionEnv() }); stop.on('error', () => child.kill()); }
      else if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); } }
    };
    const finish = (code: number | null) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(forceTimer); resolve({ stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr: Buffer.concat(stderrChunks).toString('utf8'), code, reason, durationMs: Date.now() - started }); };
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = (message: string) => { if (reason) return; reason = message; kill(); forceTimer = setTimeout(() => finish(null), 3000); };
    const timer = setTimeout(() => abort('timeout'), options.timeoutMs);
    const chunk = (data: Buffer, error: boolean) => { bytes += data.length; if (bytes > max) { abort('output_limit'); return; } (error ? stderrChunks : stdoutChunks).push(data); };
    child.stdout.on('data', data => chunk(data, false)); child.stderr.on('data', data => chunk(data, true));
    child.on('error', error => { reason = `spawn_error:${error.message}`; finish(null); });
    child.on('close', code => finish(code)); child.stdin.on('error', () => {}); child.stdin.end(options.input ?? '');
  });
}
export async function preflight(command: string, folder: string, snapshot: string, isolation: IsolationMode = 'strict', c?: HarnessCase, model = 'config-preflight-only') {
  const env = subscriptionEnv();
  const version = await capture(command, ['--version'], { cwd: snapshot, env, timeoutMs: 10000, maxBytes: 65536 });
  if (version.code !== 0) throw new Error('Codex CLI unavailable; set CODEX_CLI_PATH to its native executable');
  if (c) await validateCliConfig(command, c, snapshot, model, folder, isolation);
  const auth = await capture(command, ['login', 'status'], { cwd: snapshot, env, timeoutMs: 10000, maxBytes: 65536 });
  // Status output only: never read/copy auth files, and never accept API-key billing.
  if (auth.code !== 0 || !/ChatGPT/i.test(auth.stdout + auth.stderr) || /API key/i.test(auth.stdout + auth.stderr)) throw new Error('Codex ChatGPT subscription login unavailable; no inference attempted');
  const server = createServer(socket => socket.destroy()); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const sentinel = join(folder, 'outside-sentinel.txt'); await writeFile(sentinel, 'not a credential; must be inaccessible');
  const writeTarget = join(snapshot, '.harness', 'forbidden-write.txt');
  try {
    const port = (server.address() as { port: number }).port;
    const args = [...sandboxArgs(snapshot, isolation), 'sandbox', '--permission-profile', 'eval_read', '-C', snapshot, '--', process.execPath, join(snapshot, '.harness/probe.mjs'), writeTarget, sentinel, String(port)];
    // The fixed no-model probe's CLI needs its existing sandbox-backend state.
    // Actual model shells still receive only shell_environment_policy.set.
    const probe = await capture(command, args, { cwd: snapshot, env, timeoutMs: 15000, maxBytes: 65536 });
    await writeFile(join(folder, 'sandbox-preflight.json'), JSON.stringify({ isolation, cliVersion: version.stdout.trim(), auth: 'ChatGPT login status confirmed; credentials never read', profile: 'eval_read', probe }, null, 2));
    let state: any; try { state = JSON.parse(probe.stdout.trim().split(/\r?\n/).at(-1) ?? ''); } catch { throw new Error('Sandbox probe unavailable; read-only/network isolation not established'); }
    if (!state.writeDenied || (isolation === 'strict' && (probe.code !== 0 || !state.readDenied || !state.networkDenied))) throw new Error('Sandbox probe failed for selected isolation policy; no model trial may run');
    // Fixed non-secret canaries test the MCP boundary, separately from OS policy.
    const outsideDirectory = join(folder, 'outside-canary'); await mkdir(outsideDirectory, { recursive: true }); await writeFile(join(outsideDirectory, 'a.md'), 'NONSECRET_OUTSIDE_CANARY');
    const linkDirectory = join(snapshot, '.harness/probe-link'); await symlink(outsideDirectory, linkDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    const oversizedPath = join(snapshot, '.harness/probe-oversize.md'); const oversized = Buffer.alloc(131073, 65); await writeFile(oversizedPath, oversized);
    const actualManifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
    const probeManifest = join(folder, 'mcp-probe-manifest.json');
    await writeFile(probeManifest, JSON.stringify({ files: [...actualManifest.files,
      { source: 'runtime/link-canary', staged: '.harness/probe-link/a.md', sha256: createHash('sha256').update('NONSECRET_OUTSIDE_CANARY').digest('hex'), bytes: Buffer.byteLength('NONSECRET_OUTSIDE_CANARY') },
      { source: 'runtime/oversize-canary', staged: '.harness/probe-oversize.md', sha256: createHash('sha256').update(oversized).digest('hex'), bytes: oversized.length }] }));
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_document', arguments: { path: sentinel } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_document', arguments: { path: '../outside-sentinel.txt' } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'read_document', arguments: { path: '.harness/probe-link/a.md' } } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'read_document', arguments: { path: '.harness/probe-oversize.md' } } },
    ];
    const mcp = await capture(process.execPath, [join(PACKAGE_ROOT, 'assets/files-mcp.mjs'), snapshot, probeManifest], { cwd: snapshot, env: modelEnv(snapshot), input: requests.map(request => JSON.stringify(request)).join('\n') + '\n', timeoutMs: 5000, maxBytes: 131072 });
    await writeFile(join(folder, 'mcp-preflight.jsonl'), mcp.stdout);
    const responses = mcp.stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    if (mcp.code !== 0 || responses.length !== 6 || [3,4,5,6].some(id => !responses.find(response => response.id === id)?.error) || responses.find(response => response.id === 2)?.result?.tools?.length !== 2) throw new Error('Scoped read-only MCP probe failed; no model trial may run');
    const proof = { isolation, cliVersion: version.stdout.trim(), physicalCanaries: state, dataBoundary: 'shell/image tools disabled; manifest-scoped MCP absolute/traversal/link/oversize reads rejected',
      limitations: isolation === 'mcp-readonly' ? ['Explicit application/tool-surface isolation: OS read and network isolation are not claimed. Legacy Windows grants root reads and may permit loopback. Physical write denial and fixed scoped MCP are the safety boundaries.'] : [] };
    await writeFile(join(folder, 'isolation-proof.json'), JSON.stringify(proof, null, 2));
    return proof;
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
export async function runCodex(c: HarnessCase, folder: string, snapshot: string, model: string, prompt: string, timeoutMs: number, isolation: IsolationMode = 'strict') {
  const command = process.env.CODEX_CLI_PATH || 'codex';
  const isolationProof = await preflight(command, folder, snapshot, isolation, c, model);
  const schema = join(folder, 'answer-schema.json'), output = join(folder, 'answer.json');
  await writeFile(schema, JSON.stringify(ANSWER_SCHEMA)); await writeFile(join(folder, 'prompt.txt'), prompt);
  const result = await capture(command, execArgs(c, snapshot, model, output, schema, isolation), { cwd: snapshot, env: subscriptionEnv(), input: prompt, timeoutMs });
  await writeFile(join(folder, 'events.jsonl'), result.stdout); await writeFile(join(folder, 'stderr.txt'), result.stderr);
  try { await readFile(output); } catch { await writeFile(output, ''); }
  return { ...result, reason: result.reason ?? runtimeItemError(result.stdout), isolationProof };
}
