import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCases } from './cases.js';
import { quality } from './quality.js';
import { boundedInt, readRecords, requireLive, trial } from './runner.js';
import { preflight } from './runtime.js';
import { removeSnapshot, stageCase } from './stage.js';
import { delta, summarize } from './stats.js';
import { RESULTS_ROOT } from './paths.js';
import type { Suite, TrialRecord, IsolationMode } from './types.js';

const args = process.argv.slice(2), command = args.shift() ?? 'quality';
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index === -1 ? undefined : args[index + 1]; };
async function main() {
  const isolation = option('isolation') ?? 'strict'; if (!['strict', 'mcp-readonly'].includes(isolation)) throw new Error('--isolation must be strict or explicitly opted-in mcp-readonly');
  if (command === 'quality') { const report = await quality(); console.log(JSON.stringify(report, null, 2)); if (report.findings.length) process.exitCode = 1; return; }
  if (command === 'delta') {
    const before = option('before'), after = option('after'); if (!before || !after || before === after) throw new Error('delta requires distinct --before and --after labels');
    const records = await readRecords(); console.log(JSON.stringify(delta(records.filter(r => r.label === before), records.filter(r => r.label === after)), null, 2)); return;
  }
  const suite = option('suite'); if (suite && !['skills', 'agents', 'workflow'].includes(suite)) throw new Error('Unknown suite');
  let cases = await loadCases(suite as Suite | undefined); if (option('case')) cases = cases.filter(c => c.id === option('case')); if (!cases.length) throw new Error('No matching cases');
  if (command === 'doctor') {
    await mkdir(RESULTS_ROOT, { recursive: true }); const folder = await mkdtemp(join(RESULTS_ROOT, 'doctor-')); let snapshot: string | undefined;
    try { const staged = await stageCase(cases[0]!, folder, 'candidate'); snapshot = staged.snapshot; console.log(JSON.stringify(await preflight(process.env.CODEX_CLI_PATH || 'codex', folder, snapshot, isolation as IsolationMode, cases[0]!, process.env.EVAL_MODEL ?? 'config-preflight-only'), null, 2)); }
    finally { if (snapshot) await removeSnapshot(snapshot); console.log(`No-model preflight evidence: ${folder}`); } return;
  }
  if (!['live', 'repeat', 'benchmark'].includes(command)) throw new Error('Expected quality/live/repeat/delta/benchmark/doctor');
  requireLive();
  const count = boundedInt(option('count'), command === 'repeat' ? 3 : 1, 1, 5);
  const concurrency = boundedInt(option('concurrency'), 1, 1, 2), timeout = boundedInt(option('timeout-ms'), 120000, 1000, 300000);
  const label = option('label'); if (!label) throw new Error('Live commands require --label for reproducible comparisons');
  const configs = command === 'benchmark' ? ['baseline', 'candidate'] as const : ['candidate'] as const;
  const jobs = Array.from({ length: count }, () => cases.flatMap(c => configs.map(config => ({ c, config })))).flat();
  if (jobs.length > 24) throw new Error('At most 24 trials per invocation; filter --case or --suite');
  const records: TrialRecord[] = []; let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (next < jobs.length) { const job = jobs[next++]!; const record = await trial(job.c, label, job.config, timeout, isolation as IsolationMode); records.push(record); console.log(`${record.id}: ${record.caseId}/${record.config} ${record.status}`); } }));
  const report = command === 'benchmark' ? delta(records.filter(r => r.config === 'baseline'), records.filter(r => r.config === 'candidate')) : summarize(records);
  await mkdir(RESULTS_ROOT, { recursive: true }); await writeFile(join(RESULTS_ROOT, `${label}-${command}.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  if (records.some(record => record.status !== 'passed')) process.exitCode = 1;
}
main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
