import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subscriptionEnv, modelEnv, execArgs, capture, configPreflightArgs, configFeatureState, runtimeItemError } from '../src/runtime.js';
import { requireLive, boundedInt, rootActionCounts, normalizeActionCounts } from '../src/runner.js';
import { loadCases } from '../src/cases.js';
import { parseTrace } from '../src/trace.js';
import { scoreCase } from '../src/scoring.js';
import { statistics, summarize, delta } from '../src/stats.js';
import type { TrialRecord } from '../src/types.js';
const stream = (...events: unknown[]) => events.map(event => JSON.stringify(event)).join('\n');
const done = { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20 } };

test('model environment cannot inherit credentials and runtime fails closed without explicit live/model gates', () => {
  const env = { PATH: 'tools', HOME: 'real-home', CODEX_HOME: 'auth-home', OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', GITHUB_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', HTTP_PROXY: 'credential-proxy' };
  assert.deepEqual(subscriptionEnv(env), { PATH: 'tools', HOME: 'real-home', CODEX_HOME: 'auth-home' });
  const visible = modelEnv('/snapshot', env); assert.equal(visible.HOME, join('/snapshot', '.harness/home')); assert.equal(visible.CODEX_HOME, visible.HOME);
  assert.ok(!JSON.stringify(visible).includes('secret')); assert.ok(!JSON.stringify(visible).includes('auth-home'));
  assert.throws(() => requireLive({}), /disabled/); assert.throws(() => requireLive({ EVAL_LIVE: '1' }), /MODEL/);
  assert.throws(() => boundedInt('999', 1, 1, 2)); assert.throws(() => boundedInt('NaN', 1, 1, 5));
});
test('Codex command enforces restricted physical permissions, no network/user hooks/apps and no approval bypass', async () => {
  const c = (await loadCases('workflow')).find(c => c.delegate)!;
  const args = execArgs(c, '/snapshot', 'configured-model', '/evidence/answer', '/evidence/schema');
  assert.ok(args.includes('permissions.eval_read.network.enabled=false')); assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('permissions.eval_read.filesystem={":minimal"="read",":workspace_roots"="read"}'));
  const explicitFallback = execArgs(c, '/snapshot', 'configured-model', '/evidence/answer', '/evidence/schema', 'mcp-readonly');
  if (process.platform === 'win32') assert.ok(explicitFallback.includes('permissions.eval_read.filesystem={":root"="read"}'));
  assert.ok(args.includes('features.shell_tool=false')); assert.ok(args.includes('features.view_image=false'));
  for (const feature of ['apps', 'plugins', 'remote_plugin', 'browser_use', 'computer_use', 'in_app_browser', 'hooks', 'shell_snapshot', 'request_permissions_tool', 'code_mode']) assert.ok(args.includes(`features.${feature}=false`));
  assert.ok(args.includes('features.code_mode_host=true')); assert.ok(!args.includes('features.code_mode_host=false'));
  assert.ok(!args.includes('tools.view_image=false'));
  assert.ok(args.includes('mcp_servers.eval_files.enabled_tools=["list_documents","read_document"]'));
  assert.ok(args.includes('--ignore-user-config')); assert.ok(args.includes('--ignore-rules')); assert.ok(args.includes('--no-daemon'));
  assert.ok(!args.some(arg => /bypass|danger-full|workspace-write|approve-for-me/.test(arg)));
  assert.ok(args.includes('agents.max_concurrent_threads_per_session=1'));
  assert.throws(() => execArgs(c, '/snapshot', 'bad;model', '', ''));
  const configCheck = configPreflightArgs(c, '/snapshot', 'configured-model', '/evidence', 'mcp-readonly');
  assert.ok(!configCheck.includes('--strict-config')); assert.deepEqual(configCheck.slice(-2), ['features', 'list']);
  assert.ok(!configCheck.includes('exec')); assert.ok(!configCheck.includes('-m')); assert.ok(!configCheck.includes('-'));
  assert.ok(configCheck.includes('features.view_image=false'));
  assert.ok(configCheck.includes('features.code_mode=false')); assert.ok(configCheck.includes('features.code_mode_host=true'));
});
test('no-model config state requires the native host while generic tools and Code Mode remain disabled', () => {
  const features = 'shell_tool stable false\nview_image stable false\ncode_mode experimental false\ncode_mode_host experimental true\n';
  assert.deepEqual(configFeatureState(features), { imageDisabled: true, shellDisabled: true, codeModeDisabled: true, codeModeHostEnabled: true });
  assert.equal(configFeatureState(features.replace('code_mode_host experimental true', 'code_mode_host experimental false')).codeModeHostEnabled, false);
  assert.equal(configFeatureState(features.replace('code_mode experimental false', 'code_mode experimental true')).codeModeDisabled, false);
  assert.equal(configFeatureState(features.replace('view_image stable false\n', '')).imageDisabled, false);
  assert.equal(configFeatureState('').codeModeHostEnabled, false);
});

test('only explicit delegation cases retain rollout context; every nondelegating case remains ephemeral', async () => {
  const cases = await loadCases();
  assert.equal(cases.filter(c => c.delegate).length, 1);
  for (const c of cases) {
    const args = execArgs(c, '/snapshot', 'configured-model', '/evidence/answer', '/evidence/schema');
    assert.equal(args.includes('--ephemeral'), !c.delegate, c.id);
    assert.ok(args.includes(`agents.enabled=${Boolean(c.delegate)}`), c.id);
    assert.ok(args.includes('approval_policy="never"'), c.id);
    assert.ok(args.includes('features.shell_tool=false'), c.id);
  }
});
test('startup error items remain runtime failures even when a later turn completes', () => {
  const message = 'Code Mode is unavailable because code-mode host is disabled.';
  const raw = stream({ type: 'thread.started' }, { type: 'item.completed', item: { id: 'error', type: 'error', message } }, done);
  assert.equal(runtimeItemError(raw), `Codex runtime error: ${message}`);
  assert.equal(parseTrace(raw).rootTelemetry.complete, false);
  assert.equal(parseTrace(raw).inputTokens, 100);
  assert.equal(runtimeItemError(stream({ type: 'item.completed', item: { id: 'error', type: 'error' } }, done)), 'Codex runtime error: Unspecified completed error item');
  assert.equal(runtimeItemError(stream(done)), null);
});
test('JSON parser counts unique emitted tools, exact usage, verified source reads and only real spawn events', () => {
  const manifest = [{ source: 'server/docs/architecture.md', staged: 'server/docs/architecture.md', sha256: 'digest', bytes: 42 }];
  const item = { id: 'read', type: 'command_execution', command: 'node .harness/read.mjs "server/docs/architecture.md"', exit_code: 0, status: 'completed', aggregated_output: 'HARNESS_READ {"path":"server/docs/architecture.md","sha256":"digest","bytes":42}\nactual bytes' };
  const trace = parseTrace(stream({ type: 'item.started', item: { ...item, status: 'in_progress' } }, { type: 'item.completed', item },
    { type: 'item.completed', item: { id: 'spawn', type: 'collab_tool_call', tool: 'spawn_agent', arguments: { agent_type: 'architecture-reviewer' }, status: 'completed' } },
    { type: 'item.completed', item: { id: 'wait', type: 'collab_tool_call', tool: 'wait', status: 'completed' } },
    { type: 'item.completed', item: { id: 'text', type: 'agent_message', text: 'I spawned 99 agents and used 1234 tokens.' } }, done), manifest);
  assert.equal(trace.tools.length, 3); assert.equal(trace.reads[0]?.path, 'server/docs/architecture.md'); assert.equal(trace.delegations.length, 1);
  assert.equal(trace.delegations[0]?.role, 'architecture-reviewer'); assert.equal(trace.inputTokens, 100); assert.equal(trace.cachedInputTokens, 60); assert.equal(trace.outputTokens, 20); assert.equal(trace.billedUsd, null);
});
test('unknown/missing telemetry, spoofed/failed commands and prose cannot become successful read/delegation/zero usage', async () => {
  const manifest = [{ source: 'secret', staged: 'x', sha256: 'd', bytes: 1 }];
  const fake = { id: 'fake', type: 'command_execution', command: 'echo node .harness/read.mjs x', exit_code: 0, status: 'completed', aggregated_output: 'HARNESS_READ {"path":"x","sha256":"d","bytes":1}' };
  const trace = parseTrace(stream({ type: 'item.completed', item: fake }, { type: 'item.completed', item: { id: 'new', type: 'future_tool' } }, { type: 'turn.completed', usage: { output_tokens: 4 } }), manifest);
  assert.equal(trace.reads.length, 0); assert.equal(trace.inputTokens, null); assert.equal(trace.cachedInputTokens, null); assert.equal(trace.toolTelemetryComplete, false); assert.equal(trace.delegationTelemetry, 'unknown');
  const c = (await loadCases('workflow')).find(c => c.delegate)!;
  assert.equal(scoreCase(c, parseTrace(stream(done))).find(check => check.name === 'delegate architecture-reviewer')?.passed, false);
  const missingRole = parseTrace(stream({ type: 'item.completed', item: { id: 's', type: 'collab_tool_call', tool: 'spawn_agent', status: 'completed' } }, done));
  assert.equal(missingRole.delegations[0]?.role, null); assert.equal(scoreCase(c, missingRole).find(check => check.name.startsWith('delegate'))?.passed, false);
  assert.equal(parseTrace('{bad json').malformedLines, 1);
});

test('complete root streams prove only emitted root absence without inventing collaboration or descendant telemetry', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-negative')!;
  const answer = { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify({ answer: 'A conceptual explanation only.', verdict: 'PASS', findings: [] }) } };
  const trace = parseTrace(stream(answer, done));
  assert.equal(trace.delegationTelemetry, 'unknown');
  assert.deepEqual(trace.rootTelemetry, { scope: 'emitted_root_actions', complete: true, toolCalls: 0, spawnCalls: 0, descendantActions: 'unknown' });
  const checks = scoreCase(c, trace);
  assert.equal(checks.every(check => check.passed), true);
  assert.match(checks.find(check => check.name === 'no delegation')!.detail, /0 emitted root spawn calls.*descendant actions unknown/);
  assert.equal(trace.completedTurns, 1);
});

test('unknown and unfinished root activity cannot pass file/read/delegation absence checks or turn counts into zero', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-negative')!;
  const answer = { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify({ answer: 'No actions claimed.', verdict: 'PASS', findings: [] }) } };
  const partials = [
    { type: 'item.completed', item: { id: 'future', type: 'future_tool' } },
    { type: 'item.started', item: { id: 'pending-read', type: 'command_execution', command: 'read secret', status: 'in_progress' } },
    { type: 'item.started', item: { id: 'pending-spawn', type: 'collab_tool_call', tool: 'spawn_agent', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'not-terminal', type: 'mcp_tool_call', status: 'in_progress' } },
    { type: 'item.updated' },
    { type: 'item.completed', item: { id: 'unknown-collab', type: 'collab_tool_call', tool: 'future_collaboration_action', status: 'completed' } },
    { type: 'item.completed', item: { id: 'missing-operation', type: 'collab_tool_call', status: 'completed' } },
  ];
  for (const partial of partials) {
    const trace = parseTrace(stream(partial, answer, done));
    assert.equal(trace.toolTelemetryComplete, false);
    assert.equal(trace.rootTelemetry.complete, false);
    assert.equal(trace.rootTelemetry.toolCalls, null); assert.equal(trace.rootTelemetry.spawnCalls, null);
    const checks = scoreCase(c, trace);
    for (const name of ['no file mutations', 'no delegation', `do not activate ${c.expect.forbiddenReads![0]}`]) {
      const check = checks.find(check => check.name === name)!;
      assert.equal(check.passed, false, name); assert.match(check.detail, /Cannot verify absence.*null, not zero/);
    }
  }
  const openTurn = parseTrace(stream(answer, done, { type: 'turn.started' }));
  assert.equal(openTurn.rootTelemetry.spawnCalls, null);
  const malformed = parseTrace(stream(answer, done) + '\n{bad');
  assert.equal(scoreCase(c, malformed).find(check => check.name === 'no file mutations')!.passed, false);
});

test('terminal root events and successful named spawns retain positive evidence, while failed spawn attempts still violate no-delegation', async () => {
  const c = (await loadCases('skills')).find(c => c.id === 'insights-negative')!;
  const answer = { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify({ answer: 'Conceptual response.', verdict: 'PASS', findings: [] }) } };
  const tool = { id: 'read', type: 'mcp_tool_call', server: 'eval_files', tool: 'list_documents', status: 'completed' };
  const completed = parseTrace(stream({ type: 'item.started', item: { ...tool, status: 'in_progress' } }, { type: 'item.completed', item: tool }, answer, done));
  assert.equal(completed.rootTelemetry.complete, true); assert.equal(completed.rootTelemetry.toolCalls, 1);
  const failedSpawn = parseTrace(stream({ type: 'item.completed', item: { id: 's', type: 'collab_tool_call', tool: 'spawn_agent', status: 'failed' } }, answer, done));
  assert.equal(failedSpawn.delegations.length, 0); assert.equal(failedSpawn.rootTelemetry.spawnCalls, 1);
  assert.equal(scoreCase(c, failedSpawn).find(check => check.name === 'no delegation')!.passed, false);
  assert.doesNotMatch(scoreCase(c, failedSpawn).find(check => check.name === 'no delegation')!.detail, /Cannot verify/);
  const actualWrite = parseTrace(stream({ type: 'item.completed', item: { id: 'write', type: 'file_change', status: 'completed' } }, answer, done));
  assert.equal(scoreCase(c, actualWrite).find(check => check.name === 'no file mutations')!.passed, false);
  assert.match(scoreCase(c, actualWrite).find(check => check.name === 'no file mutations')!.detail, /1 emitted successful root/);
  const delegation = (await loadCases('workflow')).find(c => c.delegate)!;
  const named = parseTrace(stream({ type: 'item.completed', item: { id: 'named', type: 'collab_tool_call', tool: 'spawn_agent', arguments: { agent_type: delegation.expect.delegate }, status: 'completed' } }, answer, done));
  assert.equal(scoreCase(delegation, named).find(check => check.name === `delegate ${delegation.expect.delegate}`)!.passed, true);
  for (const status of ['failed', 'cancelled', undefined]) {
    const unsuccessful = parseTrace(stream({ type: 'item.completed', item: { id: 'attempt', type: 'collab_tool_call', tool: 'spawn_agent', arguments: { agent_type: delegation.expect.delegate }, status } }, answer, done));
    assert.equal(scoreCase(delegation, unsuccessful).find(check => check.name === `delegate ${delegation.expect.delegate}`)!.passed, false);
    assert.equal(unsuccessful.rootTelemetry.spawnCalls, 1);
  }
});
test('process adapter preserves nonzero failures, partial stdout, timeouts and output caps without a model', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'eval-process-'));
  try {
    const fail = await capture(process.execPath, ['-e', 'console.log("raw");process.exit(3)'], { cwd, env: subscriptionEnv(), timeoutMs: 1000 });
    assert.equal(fail.code, 3); assert.match(fail.stdout, /raw/);
    const timeout = await capture(process.execPath, ['-e', 'console.log("partial");setInterval(()=>{},1000)'], { cwd, env: subscriptionEnv(), timeoutMs: 100 }); assert.equal(timeout.reason, 'timeout');
    const large = await capture(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { cwd, env: subscriptionEnv(), timeoutMs: 1000, maxBytes: 100 }); assert.equal(large.reason, 'output_limit');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('reports retain failures/trials and unknowns, name compatible cache denominators, and guard delta comparability', () => {
  assert.deepEqual(statistics([null]), { measured: 0, unknown: 1, mean: null, sampleStddev: null, min: null, max: null });
  const record = { id: 'trial', caseId: 'case', model: 'model', status: 'passed', durationMs: 10, checks: [], toolCalls: 0, usage: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 10, billedUsd: null } } as unknown as TrialRecord;
  const report = summarize([record, { ...record, id: 'blocked', status: 'blocked', reason: 'No auth', usage: { ...record.usage, inputTokens: null } }]);
  assert.equal(report.trials, 2); assert.equal(report.blocked, 1); assert.equal(report.passRate, .5); assert.equal(report.cacheRatio, null); assert.equal(report.billedUsd, null); assert.equal(report.inputTokens.unknown, 1);
  assert.equal(summarize([record]).cacheRatio, .5); assert.equal(summarize([]).passRate, null);
  assert.equal(delta([record], [{ ...record, model: 'different' }]).comparable, false); assert.equal(delta([record], [record]).passRateDelta, 0);
});

test('record/report action counters preserve complete-root provenance and keep legacy or incomplete values unknown', () => {
  const zero = rootActionCounts(parseTrace(stream(done)));
  assert.deepEqual(zero, { toolCalls: 0, toolCallsScope: 'emitted_root_tool_calls', delegations: 0, delegationsScope: 'emitted_root_spawn_calls' });
  const partial = rootActionCounts(parseTrace(stream({ type: 'item.started', item: { id: 'pending', type: 'collab_tool_call', tool: 'spawn_agent', status: 'in_progress' } }, done)));
  assert.equal(partial.toolCalls, null); assert.equal(partial.delegations, null);
  const attempted = rootActionCounts(parseTrace(stream({ type: 'item.completed', item: { id: 'failed', type: 'collab_tool_call', tool: 'spawn_agent', status: 'failed' } }, done)));
  assert.equal(attempted.delegations, 1);
  const base = { id: 'trial', caseId: 'case', model: 'model', status: 'passed', durationMs: 10, checks: [], usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, billedUsd: null } } as unknown as TrialRecord;
  const legacy = { ...base, toolCalls: 99, delegations: 99 };
  assert.equal(normalizeActionCounts(legacy).delegations, null);
  assert.equal(normalizeActionCounts(legacy).delegationsScope, 'unknown');
  const report = summarize([legacy, { ...base, ...zero }, { ...base, ...partial }, { ...base, ...attempted }]);
  assert.deepEqual(report.delegations, statistics([null, 0, null, 1]));
  assert.equal(report.delegationsScope, 'emitted_root_spawn_calls');
  assert.deepEqual(report.toolCalls, statistics([null, 0, null, 1]));
  assert.match(report.actionTelemetryNote, /descendant actions are unknown.*Legacy values/);
});
