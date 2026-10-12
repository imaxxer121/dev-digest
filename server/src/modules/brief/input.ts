import { createHash } from 'node:crypto';
import { BriefOutput, type BlastRadius, type BriefProvenance, type BriefSource, type Intent, type IssueMeta } from '@devdigest/shared';
import { toJsonSchema } from '../../platform/structured.js';
import { AppError } from '../../platform/errors.js';
import { classifyFile, ROLE_ORDER } from '../reviews/smart-diff/index.js';
import { INPUT_BUDGET_BYTES, ADAPTER_FRAMING_BYTES, SCHEMA_NAME, SYSTEM } from './constants.js';

const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
/** Standalone same-repo references only; owner/repo#N and URL fragments are not local. */
export function localIssueNumber(body: string | null | undefined) {
  const match = body?.match(/(?:^|[\s(,;:])#([1-9]\d*)\b/);
  return match ? Number(match[1]) : null;
}
export function utf8Prefix(text: string, maxBytes: number) {
  let bytes = 0, result = '';
  for (const char of text) { const n = Buffer.byteLength(char, 'utf8'); if (bytes + n > maxBytes) break; result += char; bytes += n; }
  return result;
}
export function candidateLines(patch: string | null | undefined) {
  const result: number[] = [];
  for (const match of (patch ?? '').matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const line = Number(match[1]), count = match[2] === undefined ? 1 : Number(match[2]);
    if (line > 0 && count > 0 && !result.includes(line)) result.push(line);
    if (result.length === 4) break;
  }
  return result;
}
const source = (name: string, count: number, reason: string | null = null): BriefSource => ({
  source: name, status: count ? 'available' : 'missing', reason, truncated: false, total_count: count, included_count: count,
});
function fitTextObject<T extends Record<string, unknown>>(object: T, quota: number, keys: (keyof T)[]) {
  const copy = { ...object };
  for (const key of keys) {
    while (size(copy) > quota && typeof copy[key] === 'string' && (copy[key] as string).length) {
      copy[key] = utf8Prefix(copy[key] as string, Math.floor(Buffer.byteLength(copy[key] as string, 'utf8') * 0.8)) as T[keyof T];
    }
  }
  return copy;
}
function fitEntries<T>(entries: T[], quota: number, cap = entries.length) {
  const included: T[] = [];
  for (const entry of entries.slice(0, cap)) { if (size([...included, entry]) > quota) break; included.push(entry); }
  return included;
}
export interface BriefFacts {
  pr: { number: number; title: string; body: string | null; headSha: string };
  intent: Intent | null;
  blast: BlastRadius | null;
  files: { path: string; additions: number; deletions: number; patch?: string | null }[];
  issue: IssueMeta | null;
  issueStatus: 'not_linked' | 'unavailable' | 'available';
  specs: { path: string; content?: string | null }[];
}

/** Whitelisted facts only. The persisted patch is used solely for numeric headers. */
export function prepareBriefInput(input: BriefFacts, system = SYSTEM) {
  const fullPr = { number: input.pr.number, title: input.pr.title, body: input.pr.body, head_sha: input.pr.headSha };
  const pr = fitTextObject(fullPr, 4600, ['body', 'title']);
  const fullIssue = input.issue && { number: input.issue.number, title: input.issue.title, body: input.issue.body ?? '', state: input.issue.state };
  const linked_issue = fullIssue ? fitTextObject(fullIssue, 2500, ['body', 'title']) : null;
  let intent = input.intent && { intent: input.intent.intent, in_scope: [...input.intent.in_scope], out_of_scope: [...input.intent.out_of_scope] };
  if (intent) {
    while (size(intent) > 2000 && (intent.out_of_scope.length || intent.in_scope.length)) {
      if (intent.out_of_scope.length) intent.out_of_scope.pop(); else intent.in_scope.pop();
    }
    intent = fitTextObject(intent, 2000, ['intent']);
  }
  const callers = [...new Map((input.blast?.downstream.flatMap(d => d.callers) ?? [])
    .filter(c => c.line > 0).map(c => [JSON.stringify([c.file, c.line, c.name]), { name: c.name, file: c.file, line: c.line }])).values()]
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
  const fullBlast = input.blast && { summary: input.blast.summary, counts: input.blast.counts ?? null,
    indexed_sha: input.blast.indexed_sha ?? null, degraded: input.blast.degraded, reason: input.blast.reason ?? null, callers };
  const blast = fullBlast && { ...fullBlast, callers: fitEntries(callers, Math.max(0, 3400 - size({ ...fullBlast, callers: [] })), 64) };
  if (blast && size(blast) > 3400) {
    blast.summary = utf8Prefix(blast.summary, 400);
    while (size(blast) > 3400 && blast.callers.length) blast.callers.pop();
  }
  const allFiles = input.files.map(f => ({ path: f.path, additions: f.additions, deletions: f.deletions,
    role: classifyFile(f.path), candidate_lines: candidateLines(f.patch) }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.path.localeCompare(b.path));
  const files = fitEntries(allFiles, 5500);
  const fullSpecs = input.specs.filter(s => s.content?.trim()).sort((a, b) => a.path.localeCompare(b.path));
  const specs: { path: string; content: string; digest: string; original_bytes: number; included_bytes: number }[] = [];
  for (const doc of fullSpecs.slice(0, 8)) {
    const entry = { path: doc.path, content: doc.content!, digest: createHash('sha256').update(doc.content!, 'utf8').digest('hex'),
      original_bytes: Buffer.byteLength(doc.content!, 'utf8'), included_bytes: Buffer.byteLength(doc.content!, 'utf8') };
    while (size([...specs, entry]) > 8000 && entry.content) {
      entry.content = utf8Prefix(entry.content, Math.floor(Buffer.byteLength(entry.content, 'utf8') * 0.8));
      entry.included_bytes = Buffer.byteLength(entry.content, 'utf8');
    }
    if (!entry.content || size([...specs, entry]) > 8000) break;
    specs.push(entry);
  }
  const provenance: BriefProvenance = {
    description: source('persisted-pr', input.pr.body?.trim() ? 1 : 0, input.pr.body?.trim() ? null : 'No saved description'),
    intent: source('pr_intent', input.intent ? 1 : 0, input.intent ? 'Intent SHA coverage is unknown' : 'No saved Intent'),
    blast: source('persisted-repo-intel', input.blast ? 1 : 0, input.blast?.reason ?? (input.blast ? null : 'Blast unavailable')),
    files: source('pr_files', allFiles.length, allFiles.length ? null : 'Diff details are missing or empty'),
    linked_issue: source('github-issue', input.issue ? 1 : 0, input.issueStatus === 'available' ? null : input.issueStatus),
    specs: source('project-context/spec', fullSpecs.length, fullSpecs.length ? null : 'No saved specs'),
    intent_sha_coverage: 'unknown', indexed_sha: input.blast?.indexed_sha ?? null, specs_included: [],
  };
  if (input.issueStatus === 'unavailable') provenance.linked_issue.status = 'unavailable';
  if (!input.blast || (input.blast.degraded && !(input.blast.changed_symbols.length || callers.length))) provenance.blast.status = 'unavailable';
  provenance.description.truncated = size(pr) !== size(fullPr);
  provenance.intent.truncated = size(intent) !== size(input.intent);
  provenance.linked_issue.truncated = size(linked_issue) !== size(fullIssue);
  provenance.blast.total_count = callers.length;
  provenance.blast.included_count = blast?.callers.length ?? 0;
  provenance.blast.truncated = !!fullBlast && size(blast) !== size(fullBlast);
  provenance.files.included_count = files.length; provenance.files.truncated = files.length !== allFiles.length;
  const facts = { pr, intent, blast, files, linked_issue, specs, provenance };
  const jsonSchema = toJsonSchema(BriefOutput, SCHEMA_NAME).schema;
  function refresh() {
    provenance.specs_included = specs.map(({ content: _content, ...s }) => s);
    provenance.specs.included_count = specs.length;
    provenance.specs.truncated = specs.length !== fullSpecs.length || specs.some(s => s.included_bytes !== s.original_bytes);
    const messages = [{ role: 'system' as const, content: system }, { role: 'user' as const, content: JSON.stringify(facts) }];
    const measured = size({ messages, schemaName: SCHEMA_NAME, jsonSchema });
    return { messages, measured, total: measured + ADAPTER_FRAMING_BYTES };
  }
  let envelope = refresh();
  // Fixed reduction order, never another inference call to shrink input.
  while (envelope.total > INPUT_BUDGET_BYTES) {
    if (specs.length > 1) specs.pop();
    else if (specs[0]?.content.length) {
      specs[0].content = utf8Prefix(specs[0].content, Math.floor(specs[0].included_bytes / 2));
      specs[0].included_bytes = Buffer.byteLength(specs[0].content, 'utf8');
      if (!specs[0].content) specs.pop();
    } else if (pr.body?.length) { pr.body = utf8Prefix(pr.body, Math.floor(Buffer.byteLength(pr.body, 'utf8') / 2)); provenance.description.truncated = true; }
    else if (linked_issue?.body.length) { linked_issue.body = utf8Prefix(linked_issue.body, Math.floor(Buffer.byteLength(linked_issue.body, 'utf8') / 2)); provenance.linked_issue.truncated = true; }
    else if (blast?.callers.length) { blast.callers.pop(); provenance.blast.included_count = blast.callers.length; provenance.blast.truncated = true; }
    else if (files.length) { files.pop(); provenance.files.included_count = files.length; provenance.files.truncated = true; }
    else if (intent?.out_of_scope.length) { intent.out_of_scope.pop(); provenance.intent.truncated = true; }
    else if (intent?.in_scope.length) { intent.in_scope.pop(); provenance.intent.truncated = true; }
    else if (intent?.intent.length) { intent.intent = utf8Prefix(intent.intent, Math.floor(Buffer.byteLength(intent.intent, 'utf8') / 2)); provenance.intent.truncated = true; }
    else throw new AppError('brief_input_budget', 'Fixed brief input exceeds the 32000 UTF-8 byte budget', 422);
    envelope = refresh();
  }
  return { messages: envelope.messages, provenance, facts, metrics: {
    measured_payload_bytes: envelope.measured, adapter_framing_allowance_bytes: ADAPTER_FRAMING_BYTES as 1024,
    budgeted_input_bytes: envelope.total, input_budget_bytes: INPUT_BUDGET_BYTES as 32000, budget_unit: 'utf8_bytes' as const,
  } };
}
