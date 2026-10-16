import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT, RESULTS_ROOT } from './paths.js';
import { removeSnapshot, stageCase } from './stage.js';
import { parseTrace } from './trace.js';
import { scoreCase } from './scoring.js';
import { runCodex } from './runtime.js';
import type { HarnessCase, TrialRecord, IsolationMode, ParsedTrace } from './types.js';

/** Counts from the complete emitted root protocol, never descendant totals. */
export function rootActionCounts(trace: ParsedTrace) {
  return { toolCalls: trace.rootTelemetry.toolCalls, toolCallsScope: 'emitted_root_tool_calls' as const,
    delegations: trace.rootTelemetry.spawnCalls, delegationsScope: 'emitted_root_spawn_calls' as const };
}
export function normalizeActionCounts(record: TrialRecord): TrialRecord {
  const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  return { ...record,
    toolCalls: record.toolCallsScope === 'emitted_root_tool_calls' && count(record.toolCalls) ? record.toolCalls : null,
    delegations: record.delegationsScope === 'emitted_root_spawn_calls' && count(record.delegations) ? record.delegations : null,
    toolCallsScope: record.toolCallsScope === 'emitted_root_tool_calls' ? record.toolCallsScope : 'unknown',
    delegationsScope: record.delegationsScope === 'emitted_root_spawn_calls' ? record.delegationsScope : 'unknown' };
}

export function requireLive(env: NodeJS.ProcessEnv = process.env) {
  if (env.EVAL_LIVE !== '1') throw new Error('Live inference disabled. Explicitly set EVAL_LIVE=1; default commands never infer.');
  if (!env.EVAL_MODEL) throw new Error('Set EVAL_MODEL explicitly to a subscribed Codex model; no implicit substitute.');
}
export function buildPrompt(c: HarnessCase, config: 'candidate' | 'baseline', artifact = '') {
  const candidate = config === 'candidate' && c.candidateInstructions ? `\n\nCandidate review checklist:\n${c.candidateInstructions}` : '';
  return `Read-only harness evaluation. Follow AGENTS.md. Use only eval_files MCP list_documents/read_document(path) for file reads. Shell, image reads and general filesystem tools are disabled. No network, mutation or nested delegation. Return the requested JSON answer; findings need exact source evidence and applicable contract. A concept/proposal with no defects may use PASS and zero findings. Do not report the evaluation as passed yourself.\n${artifact}\nScenario:\n${c.prompt}${candidate}`;
}
export function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Expected integer ${min}–${max}`);
  return parsed;
}
function revision() {
  try { return { sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }; }
  catch { return { sha: null, dirty: null }; }
}
export async function trial(c: HarnessCase, label: string, config: 'candidate' | 'baseline', timeoutMs: number, isolation: IsolationMode = 'strict'): Promise<TrialRecord> {
  requireLive(); if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)) throw new Error('Use a short alphanumeric report label');
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`, folder = join(RESULTS_ROOT, 'runs', id);
  await mkdir(folder, { recursive: true });
  for (const name of ['events.jsonl', 'stderr.txt', 'answer.json', 'prompt.txt']) await writeFile(join(folder, name), '');
  const record: TrialRecord = { schema: 1, id, label, caseId: c.id, suite: c.suite, config, evidenceKind: 'live', startedAt: new Date().toISOString(), model: process.env.EVAL_MODEL!, runtime: 'codex-subscription', revision: revision(),
    status: 'blocked', reason: null, durationMs: 0, checks: [], usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, billedUsd: null, scope: 'Sum of emitted root CLI turn.completed counters; nested-agent inclusion is not certified' },
    rawEvents: `runs/${id}/events.jsonl`, rawStderr: `runs/${id}/stderr.txt`, outputFile: `runs/${id}/answer.json`, promptFile: `runs/${id}/prompt.txt`, manifestFile: `runs/${id}/manifest.json`, toolCalls: null, delegations: null,
    toolCallsScope: 'emitted_root_tool_calls', delegationsScope: 'emitted_root_spawn_calls', manifestDigest: '', isolationMode: isolation, isolationProof: null };
  const started = Date.now(); let snapshot: string | undefined;
  try {
    const staged = await stageCase(c, folder, config); snapshot = staged.snapshot; record.manifestDigest = staged.manifestDigest;
    const artifact = c.suite === 'agents' && c.artifact && config === 'candidate' ? `\nRole instructions (runtime translates Read/Glob/Grep to the fixed read-only MCP):\n${await readFile(join(snapshot, c.artifact), 'utf8')}\n` : '';
    const prompt = buildPrompt(c, config, artifact);
    await writeFile(join(folder, 'prompt.txt'), prompt);
    const processResult = await runCodex(c, folder, snapshot, record.model, prompt, timeoutMs, isolation); record.isolationProof = processResult.isolationProof;
    const trace = parseTrace(processResult.stdout, staged.manifest);
    // -o and agent_message are independently preserved. The parsed JSON event is the scored output.
    record.checks = scoreCase(c, trace); Object.assign(record, rootActionCounts(trace));
    for (const path of c.expect.absentFiles ?? []) {
      let absent = false; try { await lstat(join(snapshot, path)); } catch (error) { absent = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
      record.checks.push({ name: `write canary absent ${path}`, passed: absent, detail: 'Host filesystem observation after trial; absence alone does not prove a tool attempted a write. Inspect raw tool events.' });
    }
    record.usage.inputTokens = trace.inputTokens; record.usage.cachedInputTokens = trace.cachedInputTokens; record.usage.outputTokens = trace.outputTokens;
    const good = processResult.code === 0 && !processResult.reason && record.checks.every(check => check.passed);
    record.status = good ? 'passed' : 'failed'; record.reason = good ? null : processResult.reason ?? (processResult.code !== 0 ? `CLI exit ${processResult.code}` : 'Behavioral assertions failed');
    await writeFile(join(folder, 'parsed-trace.json'), JSON.stringify(trace, null, 2));
  } catch (error) { record.reason = (error as Error).message; }
  finally {
    record.durationMs = Date.now() - started;
    await writeFile(join(folder, 'record.json'), JSON.stringify(record, null, 2)); await appendFile(join(RESULTS_ROOT, 'records.jsonl'), JSON.stringify(record) + '\n');
    if (snapshot) await removeSnapshot(snapshot);
  }
  return record;
}
export async function readRecords() {
  let text: string; try { text = await readFile(join(RESULTS_ROOT, 'records.jsonl'), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return text.split(/\r?\n/).filter(Boolean).map(line => { const record = JSON.parse(line); if (record.schema !== 1 || record.evidenceKind !== 'live') throw new Error('Unsupported record schema'); return normalizeActionCounts(record as TrialRecord); });
}
