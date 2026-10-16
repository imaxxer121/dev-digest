import type { Answer, HarnessCase, ParsedTrace } from './types.js';
import { canonicalPath } from './cases.js';
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const concepts = (text: string, groups: string[][]) => groups.every(group => group.some(term => text.toLowerCase().includes(term.toLowerCase())));
function exactObject(value: unknown, required: string[], optional: string[] = []): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
}
export function parseAnswer(text: string): Answer {
  const value = JSON.parse(text);
  if (!exactObject(value, ['answer', 'verdict', 'findings'], ['proposedInsight']) || !nonempty(value.answer) || !['PASS', 'FAIL', 'REVIEW'].includes(value.verdict) || !Array.isArray(value.findings)) throw new Error('Invalid final answer schema');
  for (const finding of value.findings) if (!exactObject(finding, ['file', 'line', 'severity', 'evidence', 'rule', 'reason']) || !nonempty(finding.file) || !Number.isSafeInteger(finding.line) || finding.line < 1 || !['critical', 'high', 'medium', 'low', 'info'].includes(finding.severity) || ['evidence', 'rule', 'reason'].some(key => !nonempty(finding[key]))) throw new Error('Invalid finding');
  if (value.proposedInsight !== undefined && value.proposedInsight !== null) {
    const insight = value.proposedInsight;
    if (!exactObject(insight, ['date', 'discovery', 'consequence', 'source', 'verification']) || !/^\d{4}-\d{2}-\d{2}$/.test(insight.date) || Number.isNaN(Date.parse(insight.date)) || new Date(insight.date).toISOString().slice(0, 10) !== insight.date || !nonempty(insight.discovery) || !nonempty(insight.consequence)) throw new Error('Invalid proposed Insight schema');
    if (!exactObject(insight.source, ['file', 'line', 'evidence']) || !canonicalPath(insight.source.file) || !Number.isSafeInteger(insight.source.line) || insight.source.line < 1 || !nonempty(insight.source.evidence)) throw new Error('Invalid proposed Insight source');
    if (!exactObject(insight.verification, ['provenance', 'evidence', 'result', 'command']) || !['user_report', 'source_record', 'model_observation'].includes(insight.verification.provenance) || !nonempty(insight.verification.evidence) || !nonempty(insight.verification.result) || (insight.verification.command !== null && !nonempty(insight.verification.command))) throw new Error('Invalid proposed Insight verification');
  }
  return value as Answer;
}
export function scoreCase(c: HarnessCase, trace: ParsedTrace) {
  const checks: { name: string; passed: boolean; detail: string }[] = [];
  const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });
  add('completed', trace.completedTurns > 0 && !trace.failures.length && trace.malformedLines === 0, trace.failures.join('; ') || `${trace.completedTurns} completed turns; ${trace.malformedLines} malformed lines`);
  const complete = trace.toolTelemetryComplete && trace.rootTelemetry.complete;
  const absenceDetail = 'Cannot verify absence: the recognized root action stream is incomplete or unknown; counts remain null, not zero';
  add('no file mutations', complete && trace.writes.length === 0, !complete ? absenceDetail : `${trace.writes.length} emitted successful root file-change items; descendant actions unknown; physical sandbox separately enforced`);
  if (c.expect.noTools) add('no tool calls', trace.tools.length === 0 && complete, !complete ? absenceDetail : 'Complete recognized stream has zero emitted root tool calls; descendant actions remain unknown');
  for (const path of c.expect.reads ?? []) add(`read ${path}`, trace.reads.some(read => read.path === path), 'Requires successful fixed MCP read (or historical helper event) with matching staged digest/bytes');
  for (const path of c.expect.forbiddenReads ?? []) add(`do not activate ${path}`, complete && !trace.reads.some(read => read.path === path), !complete ? absenceDetail : 'Complete recognized root stream has no verified activation read of this path; uncredited tool commands remain for manual audit, descendant reads unknown');
  if (c.expect.delegate) add(`delegate ${c.expect.delegate}`, trace.delegations.some(item => item.role === c.expect.delegate), trace.delegationTelemetry === 'unknown' ? 'Delegation telemetry unknown; prose is not evidence' : 'Requires emitted spawn_agent with exact role');
  if (c.expect.noDelegation) add('no delegation', complete && trace.rootTelemetry.spawnCalls === 0, !complete ? absenceDetail : `${trace.rootTelemetry.spawnCalls} emitted root spawn calls; capability metadata ${trace.delegationTelemetry}; descendant actions unknown`);
  try {
    const answer = parseAnswer(trace.text);
    add('verdict', answer.verdict === c.expect.verdict, `Expected ${c.expect.verdict}; received ${answer.verdict}`);
    if (c.expect.minFindings !== undefined) add('minimum findings', answer.findings.length >= c.expect.minFindings, `${answer.findings.length} findings`);
    if (c.expect.maxFindings !== undefined) add('maximum findings', answer.findings.length <= c.expect.maxFindings, `${answer.findings.length} findings`);
    const evidence = answer.findings.map(finding => finding.evidence).join('\n');
    for (const snippet of c.expect.evidence ?? []) add(`source evidence ${snippet}`, evidence.includes(snippet), 'Verbatim finding evidence, not claimed tool usage');
    for (const summary of c.expect.summaryConcepts ?? []) add(`answer summary: ${summary.name}`, concepts(answer.answer, summary.concepts), 'Requires the requested concepts in the answer summary as well as verified source reads and the exact case verdict');
    if (c.expect.answerRubric) {
      const rubric = c.expect.answerRubric, insight = answer.proposedInsight;
      add('proposed Insight artifact', !!insight, 'The requested proposal needs structured date, discovery, consequence, source citation and verification fields; a PASS label is insufficient');
      if (insight) {
        add('Insight discovery', concepts(insight.discovery, rubric.discoveryConcepts), 'Discovery must describe the specific Windows URL/entry-point behavior from the supplied scenario');
        add('Insight consequence', concepts(insight.consequence, rubric.consequenceConcepts), 'Practical consequence must connect the entry-point comparison to skipped migration execution');
        add('Insight source citation', insight.source.file === rubric.source.file && insight.source.line === rubric.source.line && insight.source.evidence.includes(rubric.source.evidence), 'Requires the case source path, actual line and relevant source expression');
        // A reported verification can be paraphrased and split across these fields.
        // The rubric's evidence string anchors the source case, not an exact quote
        // the model must repeat in first person.
        const verification = `${insight.verification.evidence}\n${insight.verification.result}`;
        const unsupportedMeasurement = /\b(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\s+(?:tests?|fixtures?|passed|failures?|tokens?|ms|seconds?)\b|\b(?:tests?|fixtures?|passed|failures?|tokens?)\s*[:=]?\s*\d+/i.test(verification);
        const unsupportedResult = /\b(?:all\s+)?tests?\s+(?:passed|succeeded)\b|\b(?:I|we)\s+(?:personally\s+)?(?:ran|reran|executed|verified|confirmed|tested)\b/i.test(insight.verification.result);
        const unverified = /\bunverified\b|\b(?:not|never)\s+(?:been\s+)?verified\b|\bno\s+(?:deterministic\s+)?fixtures?\s+verification\b/i.test(verification);
        add('Insight verified result', insight.verification.provenance === rubric.verification.provenance && insight.verification.command === null && concepts(verification, rubric.verification.resultConcepts) && !unsupportedMeasurement && !unsupportedResult && !unverified, 'Accept a supported paraphrase across verification evidence/result; require user_report, no command, and no invented measurements or fresh test claims');
      }
    }
  } catch { add('structured answer', false, 'Missing or invalid final JSON answer'); }
  return checks;
}
export const ANSWER_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  answer: { type: 'string', minLength: 1, pattern: '\\S' }, verdict: { type: 'string', enum: ['PASS', 'FAIL', 'REVIEW'] },
  findings: { type: 'array', items: { type: 'object', additionalProperties: false,
    properties: { file: { type: 'string', minLength: 1 }, line: { type: 'integer', minimum: 1 }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] }, evidence: { type: 'string', minLength: 1 }, rule: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1 } }, required: ['file', 'line', 'severity', 'evidence', 'rule', 'reason'] } },
  proposedInsight: { description: 'For a requested proposed INSIGHTS entry, supply this structured artifact in addition to the answer summary. Use null when no insight proposal is requested. Verification must name its actual evidence provenance; do not invent commands or counts.', anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
    properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, discovery: { type: 'string', minLength: 1 }, consequence: { type: 'string', minLength: 1 },
      source: { type: 'object', additionalProperties: false, properties: { file: { type: 'string', minLength: 1 }, line: { type: 'integer', minimum: 1 }, evidence: { type: 'string', minLength: 1 } }, required: ['file', 'line', 'evidence'] },
      verification: { type: 'object', additionalProperties: false, properties: { provenance: { type: 'string', enum: ['user_report', 'source_record', 'model_observation'] }, evidence: { type: 'string', minLength: 1 }, result: { type: 'string', minLength: 1 }, command: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 1 }] } }, required: ['provenance', 'evidence', 'result', 'command'] } },
    required: ['date', 'discovery', 'consequence', 'source', 'verification'] }] },
}, required: ['answer', 'verdict', 'findings', 'proposedInsight'] };
