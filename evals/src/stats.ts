import type { TrialRecord } from './types.js';
export function statistics(values: (number | null)[]) {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const n = known.length, mean = n ? known.reduce((sum, value) => sum + value, 0) / n : null;
  return { measured: n, unknown: values.length - n, mean, sampleStddev: n > 1 ? Math.sqrt(known.reduce((sum, value) => sum + (value - mean!) ** 2, 0) / (n - 1)) : null,
    min: n ? Math.min(...known) : null, max: n ? Math.max(...known) : null };
}
export function summarize(records: TrialRecord[]) {
  const passed = records.filter(record => record.status === 'passed').length;
  const allInputKnown = records.length > 0 && records.every(record => record.usage.inputTokens !== null && record.usage.cachedInputTokens !== null);
  const input = allInputKnown ? records.reduce((sum, record) => sum + record.usage.inputTokens!, 0) : null;
  const cached = allInputKnown ? records.reduce((sum, record) => sum + record.usage.cachedInputTokens!, 0) : null;
  return { trials: records.length, passed, failed: records.filter(record => record.status === 'failed').length, blocked: records.filter(record => record.status === 'blocked').length,
    passRate: records.length ? passed / records.length : null,
    durationMs: statistics(records.map(record => record.durationMs)), inputTokens: statistics(records.map(record => record.usage.inputTokens)), outputTokens: statistics(records.map(record => record.usage.outputTokens)),
    cachedInputTokens: statistics(records.map(record => record.usage.cachedInputTokens)),
    toolCalls: statistics(records.map(record => record.toolCallsScope === 'emitted_root_tool_calls' ? record.toolCalls : null)),
    delegations: statistics(records.map(record => record.delegationsScope === 'emitted_root_spawn_calls' ? record.delegations : null)),
    toolCallsScope: 'emitted_root_tool_calls', delegationsScope: 'emitted_root_spawn_calls',
    actionTelemetryNote: 'Counts cover emitted root actions only; descendant actions are unknown. Legacy values without matching explicit scope remain unknown.',
    billedUsd: null, billedUsdReason: 'Subscription CLI does not report billed USD',
    cacheRatio: input !== null && input > 0 && cached !== null && cached <= input ? cached / input : null,
    cacheRatioDenominator: 'Sum of measured CLI turn.completed input_tokens over every selected trial; unknown if any trial lacks either counter',
    failures: records.filter(record => record.status !== 'passed').map(record => ({ id: record.id, caseId: record.caseId, status: record.status, reason: record.reason, failedChecks: record.checks.filter(check => !check.passed) })) };
}
export function delta(before: TrialRecord[], after: TrialRecord[]) {
  const a = summarize(before), b = summarize(after);
  const comparable = before.length > 0 && after.length > 0 && JSON.stringify([...new Set(before.map(r => r.caseId))].sort()) === JSON.stringify([...new Set(after.map(r => r.caseId))].sort()) &&
    new Set([...before, ...after].map(r => r.model)).size === 1 && new Set([...before, ...after].map(r => r.isolationMode)).size === 1;
  return { before: a, after: b, comparable, passRateDelta: comparable && a.passRate !== null && b.passRate !== null ? b.passRate - a.passRate : null,
    note: 'Descriptive finite-sample delta, not statistical significance. Same model/case set/isolation mode required; inspect trial counts, revisions, source manifests and failures.' };
}
