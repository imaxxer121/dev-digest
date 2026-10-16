/**
 * Read-only reproduction of two saved L05 requests; never starts a provider or DB.
 * Run from the repository root with the server's tsx and tsconfig. Supply the
 * private cache locations explicitly; neither those paths nor prompt bodies are
 * written to the public artifact. See brief-byte-budget.json for the command.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BriefOutput } from '../../../server/src/vendor/shared/contracts/brief.js';
import { toJsonSchema } from '../../../reviewer-core/src/llm/structured.js';
import { ADAPTER_FRAMING_BYTES, INPUT_BUDGET_BYTES, SCHEMA_NAME, SYSTEM } from '../../../server/src/modules/brief/constants.js';

type Json = Record<string, any>;
const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const options = new Map<string, string>();
const names = new Set(['first-response', 'first-call-dir', 'regenerated-response', 'regenerated-call-dir', 'cache-proof', 'verification-log', 'baseline-ref']);
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, ''), value = process.argv[i + 1];
  assert(key && names.has(key) && value && !value.startsWith('--') && !options.has(key), 'Supply each documented --name value once');
  options.set(key, value);
}
function option(name: string) { const value = options.get(name); assert(value, `Missing --${name}`); return value; }
function read(path: string) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_048_576, 'Expected an explicitly selected regular input file <= 1 MiB');
  return readFileSync(path);
}
function keys(value: Json, expected: string[]) { assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'Prepared source field allowlist'); }
function logicalPath(path: unknown) { assert(typeof path === 'string' && path.length && !/^(?:[A-Za-z]:|\/)/.test(path) && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected a repository-relative logical path'); }

/** The spec body is allowed untrusted documentation; file source/diff bodies are not. */
function checkAllowlist(facts: Json) {
  keys(facts, ['pr', 'intent', 'blast', 'files', 'linked_issue', 'specs', 'provenance']);
  keys(facts.pr, ['number', 'title', 'body', 'head_sha']);
  if (facts.intent) keys(facts.intent, ['intent', 'in_scope', 'out_of_scope']);
  if (facts.linked_issue) keys(facts.linked_issue, ['number', 'title', 'body', 'state']);
  if (facts.blast) {
    keys(facts.blast, ['summary', 'counts', 'indexed_sha', 'degraded', 'reason', 'callers']);
    if (facts.blast.counts) keys(facts.blast.counts, ['symbols', 'callers', 'endpoints', 'crons']);
    for (const caller of facts.blast.callers) { keys(caller, ['name', 'file', 'line']); logicalPath(caller.file); assert(Number.isInteger(caller.line) && caller.line > 0); }
  }
  for (const file of facts.files) {
    keys(file, ['path', 'additions', 'deletions', 'role', 'candidate_lines']); logicalPath(file.path);
    assert(file.candidate_lines.length <= 4 && file.candidate_lines.every((line: number) => Number.isInteger(line) && line > 0));
  }
  for (const spec of facts.specs) {
    keys(spec, ['path', 'content', 'digest', 'original_bytes', 'included_bytes']); logicalPath(spec.path);
    assert(/^[a-f0-9]{64}$/.test(spec.digest)); assert.equal(bytes(spec.content), spec.included_bytes);
    assert(spec.included_bytes > 0 && spec.included_bytes <= spec.original_bytes);
  }
  keys(facts.provenance, ['description', 'intent', 'blast', 'files', 'linked_issue', 'specs', 'intent_sha_coverage', 'indexed_sha', 'specs_included']);
  for (const name of ['description', 'intent', 'blast', 'files', 'linked_issue', 'specs']) keys(facts.provenance[name], ['source', 'status', 'reason', 'truncated', 'total_count', 'included_count']);
  for (const spec of facts.provenance.specs_included) keys(spec, ['path', 'digest', 'original_bytes', 'included_bytes']);
  const walk = (value: unknown) => {
    if (typeof value === 'string') assert(!/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(value), 'No diff hunk headers in this saved request');
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      assert(!/^(?:patch|diff|hunks?|raw_source|source_code)$/i.test(key), 'No source/diff body fields'); walk(child);
    }
  };
  walk(facts);
  return { exact_field_allowlists: true, file_source_or_patch_fields: 0, diff_hunk_headers: 0,
    file_fields: ['path', 'additions', 'deletions', 'role', 'candidate_lines'], numeric_candidate_lines_only: true,
    supplied_sources: ['persisted PR description', 'persisted Blast metadata and caller identities', 'changed-file metadata and numeric anchors', 'truncated attached specification'],
    missing_sources: ['saved Intent', 'linked issue'], source_bodies_permitted: ['PR/issue descriptions, Intent prose, specification prose when available'] };
}

assert.equal(INPUT_BUDGET_BYTES, 32_000); assert.equal(ADAPTER_FRAMING_BYTES, 1_024); assert.equal(SCHEMA_NAME, 'pr_risk_brief');
const cacheProofBuffer = read(option('cache-proof'));
const cacheProof: Json = JSON.parse(cacheProofBuffer.toString('utf8'));
const schemaNow = toJsonSchema(BriefOutput, SCHEMA_NAME).schema;
const knownIds: Record<string, string> = { first: '815d4fd7-1dd0-402a-8833-b81d57c3ef87', regenerated: 'a42a3859-08e4-45eb-834c-dc114c05dbc9' };
function reproduce(label: 'first' | 'regenerated') {
  const responseBuffer = read(option(`${label}-response`));
  const response: Json = JSON.parse(responseBuffer.toString('utf8'));
  const saved = response.brief.generation, callDir = option(`${label}-call-dir`);
  assert.equal(saved.call_id, knownIds[label]);
  const promptBuffer = read(join(callDir, 'prompt.txt')), schemaBuffer = read(join(callDir, 'schema.json'));
  const eventsBuffer = read(join(callDir, 'events.jsonl')), resultBuffer = read(join(callDir, 'result.txt'));
  const prompt = promptBuffer.toString('utf8'), jsonSchema = JSON.parse(schemaBuffer.toString('utf8'));
  const systemMatches = [...prompt.matchAll(/<system>\r?\n([\s\S]*?)\r?\n<\/system>/g)];
  const userMatches = [...prompt.matchAll(/<user>\r?\n([\s\S]*?)\r?\n<\/user>/g)];
  assert.equal(systemMatches.length, 1); assert.equal(userMatches.length, 1);
  const system = systemMatches[0]![1]!, user = userMatches[0]![1]!;
  assert.equal(system, SYSTEM); assert.deepEqual(jsonSchema, schemaNow);
  const facts = JSON.parse(user), allowlist = checkAllowlist(facts);
  assert.equal(facts.intent, null); assert.equal(facts.linked_issue, null); assert(facts.blast && facts.specs.length);
  assert.equal(JSON.stringify(facts), user, 'Actual prepared user message is the saved compact JSON, without reformatting');
  assert.equal(facts.pr.head_sha, response.brief.head_sha); assert.deepEqual(facts.provenance, response.brief.provenance);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const payload = JSON.stringify({ messages, schemaName: SCHEMA_NAME, jsonSchema });
  const measured = bytes(payload), total = measured + ADAPTER_FRAMING_BYTES;
  assert.equal(saved.measured_payload_bytes, measured); assert.equal(saved.adapter_framing_allowance_bytes, ADAPTER_FRAMING_BYTES);
  assert.equal(saved.budgeted_input_bytes, total); assert.equal(saved.input_budget_bytes, INPUT_BUDGET_BYTES);
  assert.equal(saved.budget_unit, 'utf8_bytes'); assert(total <= INPUT_BUDGET_BYTES);
  assert.equal(saved.application_calls, 1); assert.equal(saved.attempts, 1);
  const events: Json[] = eventsBuffer.toString('utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.equal(events.filter(event => event.type === 'thread.started').length, 1);
  assert.equal(events.filter(event => event.type === 'turn.started').length, 1);
  const turns = events.filter(event => event.type === 'turn.completed'); assert.equal(turns.length, 1);
  assert(!events.some(event => event.type === 'error' || event.type === 'turn.failed'));
  const completed = events.filter(event => event.type === 'item.completed');
  assert.equal(completed.length, 1); assert.equal(completed[0]!.item.type, 'agent_message');
  const result = JSON.parse(resultBuffer.toString('utf8'));
  assert.deepEqual(result, JSON.parse(completed[0]!.item.text));
  assert.equal(result.summary, response.brief.summary);
  assert.deepEqual(result.risks, response.brief.risks.risks); assert.deepEqual(result.review_focus, response.brief.review_focus);
  const usage = turns[0]!.usage;
  assert.equal(usage.input_tokens, saved.tokens_in); assert.equal(usage.output_tokens, saved.tokens_out);
  const oldProof = cacheProof.calls.find((call: Json) => call.call_id === saved.call_id); assert(oldProof);
  assert.equal(oldProof.label, label); assert.deepEqual(oldProof.usage, usage);
  assert.equal(oldProof.measured_payload_bytes, measured); assert.equal(oldProof.budgeted_input_bytes, total);
  assert.equal(oldProof.framing_allowance_bytes, ADAPTER_FRAMING_BYTES); assert.equal(oldProof.input_budget_bytes, INPUT_BUDGET_BYTES);
  assert.equal(oldProof.tool_items, 0); assert.equal(oldProof.one_process, true); assert.equal(oldProof.one_structured_attempt, true);
  return { label, call_id: saved.call_id, generated_at: response.brief.generated_at, head_sha: response.brief.head_sha,
    provider: saved.provider, model: saved.model,
    saved_response: `work/l05-${label === 'first' ? 'generated' : 'regenerated'}.json`,
    hashes: { application_request_sha256: sha(payload), messages_json_sha256: sha(JSON.stringify(messages)), schema_json_sha256: sha(JSON.stringify(jsonSchema)),
      saved_prompt_file_sha256: sha(promptBuffer), saved_schema_file_sha256: sha(schemaBuffer), saved_events_file_sha256: sha(eventsBuffer),
      saved_result_file_sha256: sha(resultBuffer), saved_response_file_sha256: sha(responseBuffer) },
    measured_payload_bytes: measured, adapter_framing_allowance_bytes: ADAPTER_FRAMING_BYTES, budgeted_input_bytes: total,
    input_budget_bytes: INPUT_BUDGET_BYTES, budget_unit: 'utf8_bytes', remaining_bytes: INPUT_BUDGET_BYTES - total,
    exact_saved_metrics_match: true, current_system_and_schema_match: true, within_budget: true, source_allowlist: allowlist,
    specifications: facts.specs.map((spec: Json) => ({ path: spec.path, original_sha256: spec.digest,
      included_content_sha256: sha(spec.content), original_bytes: spec.original_bytes, included_bytes: spec.included_bytes,
      truncated: spec.included_bytes !== spec.original_bytes })),
    saved_runtime_evidence: { application_calls: saved.application_calls, attempts: saved.attempts,
      threads_started: 1, completed_turns: 1, completed_agent_messages: 1, completed_tool_items: 0,
      response_and_events_match: true, usage, cost_usd: saved.cost_usd } };
}
const calls = [reproduce('first'), reproduce('regenerated')];
assert.equal(calls[0]!.hashes.application_request_sha256, calls[1]!.hashes.application_request_sha256);
assert.notEqual(calls[0]!.call_id, calls[1]!.call_id);

const baseline = options.get('baseline-ref') ?? '7dc2a00';
assert(/^[a-zA-Z0-9_./-]+$/.test(baseline) && !baseline.startsWith('-'));
const normalized = (text: string) => text.replace(/\r\n/g, '\n');
const sourcePaths = ['server/src/modules/brief/input.ts', 'server/src/modules/brief/constants.ts',
  'server/src/vendor/shared/contracts/brief.ts', 'reviewer-core/src/llm/structured.ts', 'server/test/brief-input.test.ts'];
const sourceProvenance = sourcePaths.map(path => {
  const current = normalized(read(join(repoRoot, path)).toString('utf8'));
  const previous = normalized(execFileSync('git', ['show', `${baseline}:${path}`], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1_048_576, windowsHide: true }));
  assert.equal(current, previous, `${path} changed since the stated baseline`);
  return { path, sha256_lf_normalized: sha(current), unchanged_from_baseline: true };
});
const logBuffer = read(option('verification-log')), logLines = logBuffer.toString('utf8').split(/\r?\n/);
const selectLog = (needle: string) => {
  const index = logLines.findIndex(line => line.includes(needle)); assert(index >= 0, `Missing logged result: ${needle}`);
  return { line: index + 1, text: logLines[index]!.trim() };
};
const loggedResults = [selectLog('test/brief-contract.test.ts (2 tests)'), selectLog('test/brief-input.test.ts (5 tests)'),
  selectLog('bounds Unicode/escaping/many entries deterministically'), selectLog('Tests  281 passed (281)')];
assert(cacheProof.unchanged_reload && cacheProof.explicit_regeneration_new_call && cacheProof.stale_preserved_second_brief && cacheProof.restored_response_equal_second);
const output = { acceptance: 'AC-COMP02', result: 'PASS', kind: 'deterministic recomputation of retained historical model requests',
  scope: 'Application-controlled JSON.stringify({messages, schemaName, jsonSchema}) UTF-8 bytes plus a 1024-byte framing reserve. Provider-hidden prompts and provider token usage are outside this byte-budget assertion.',
  formula: "Buffer.byteLength(JSON.stringify({messages, schemaName: 'pr_risk_brief', jsonSchema}), 'utf8') + 1024 <= 32000",
  byte_budget_is_not_a_token_limit: true, current_baseline_ref: baseline, current_sources: sourceProvenance,
  calls, both_calls_have_identical_application_request: true,
  historical_cache_proof: { path: 'work/dev-digest/docs/evidence/l05/cache-sha-proof.json', sha256: sha(cacheProofBuffer),
    assertions_rechecked: ['call IDs/metrics/usage match actual saved prompt/schema/events/result', 'unchanged reload', 'explicit regeneration uses a new call', 'stale brief retained', 'restored response equals regenerated response'],
    process_counts: 'Historical counts retained in the original proof; no current cache-directory count was used or inferred.' },
  boundary_unit_results: { source: 'work/course-labs-full-verification.log', sha256: sha(logBuffer), evidence: loggedResults,
    cases_in_current_unchanged_test: ['exact message/schema envelope plus reserve and patch-body exclusion', 'Unicode/escaping/large entry bounds, deterministic truncation, spec prefix and digest',
      'fixed-envelope overflow fails before returning a request', 'Unicode code-point prefix and capped positive numeric anchors'],
    status: 'Root verification log records all 5 brief-input tests passing; this helper does not run the unit suite.' },
  reproduction: { script: 'docs/evidence/course-labs-completion/reproduce-brief-budget.mts',
    command: 'node server/node_modules/tsx/dist/cli.mjs --tsconfig server/tsconfig.json docs/evidence/course-labs-completion/reproduce-brief-budget.mts --first-response <first-response.json> --first-call-dir <retained-first-call-directory> --regenerated-response <regenerated-response.json> --regenerated-call-dir <retained-regenerated-call-directory> --cache-proof <cache-sha-proof.json> --verification-log <course-labs-full-verification.log>',
    private_inputs: 'Explicit local input paths are caller-supplied. Only call IDs, file digests and repository-relative teaching paths are published. No directory discovery, model invocation, network or application database access occurs.' },
  limitations: ['The two model executions were retained from 2026-10-12; this is not a new live model run.',
    'The current preparer/constants/output contract/schema converter are unchanged from the baseline, and the current system/schema match the historical requests; the helper does not recreate the original database snapshot.',
    'The framing reserve is an application allowance, not a measurement or guarantee of provider-hidden prompt bytes or tokens.',
    'Runtime usage is reported separately and is not converted to bytes; nullable USD cost remains unknown.',
    'Original specification digest/byte count is retained provenance; only the included specification content and its UTF-8 byte count are independently hashed here.'] };
writeFileSync(join(here, 'brief-byte-budget.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ result: output.result, calls: calls.map(call => ({ label: call.label, call_id: call.call_id,
  request_sha256: call.hashes.application_request_sha256, measured_payload_bytes: call.measured_payload_bytes,
  reserve_bytes: call.adapter_framing_allowance_bytes, budgeted_input_bytes: call.budgeted_input_bytes, limit_bytes: call.input_budget_bytes,
  input_tokens_separate: call.saved_runtime_evidence.usage.input_tokens })), unchanged_sources: sourceProvenance.length,
  output: 'docs/evidence/course-labs-completion/brief-byte-budget.json' }, null, 2));
