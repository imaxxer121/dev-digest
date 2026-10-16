export type Suite = 'skills' | 'agents' | 'workflow';
export type IsolationMode = 'strict' | 'mcp-readonly';
export interface InsightRubric {
  kind: 'insight';
  discoveryConcepts: string[][];
  consequenceConcepts: string[][];
  source: { file: string; line: number; evidence: string };
  verification: { provenance: 'user_report'; evidence: string; resultConcepts: string[][] };
}
export interface HarnessCase {
  id: string; suite: Suite; name: string; prompt: string;
  candidateInstructions?: string;
  artifact?: string; nativeSkill?: string; delegate?: string;
  files: string[];
  expect: { reads?: string[]; forbiddenReads?: string[]; verdict: 'PASS' | 'FAIL' | 'REVIEW';
    minFindings?: number; maxFindings?: number; evidence?: string[]; delegate?: string; noDelegation?: boolean; noTools?: boolean; absentFiles?: string[]; answerRubric?: InsightRubric;
    summaryConcepts?: { name: string; concepts: string[][] }[] };
}
export interface Finding { file: string; line: number; severity: string; evidence: string; rule: string; reason: string }
export interface InsightProposal {
  date: string; discovery: string; consequence: string;
  source: { file: string; line: number; evidence: string };
  verification: { provenance: 'user_report' | 'source_record' | 'model_observation'; evidence: string; result: string; command: string | null };
}
export interface Answer { answer: string; verdict: 'PASS' | 'FAIL' | 'REVIEW'; findings: Finding[]; proposedInsight?: InsightProposal | null }
export interface ReadEvidence { path: string; sha256: string; bytes: number; itemId: string; method: 'verified_helper_command' | 'verified_mcp_read' }
export interface ParsedTrace {
  text: string; tools: { id: string; type: string; command?: string; status?: string }[];
  reads: ReadEvidence[]; delegations: { id: string; tool: string; role: string | null; status: string | null }[];
  writes: string[]; failures: string[]; unknownEvents: string[]; malformedLines: number;
  completedTurns: number; inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null;
  toolTelemetryComplete: boolean;
  rootTelemetry: { scope: 'emitted_root_actions'; complete: boolean; toolCalls: number | null; spawnCalls: number | null; descendantActions: 'unknown' };
  delegationTelemetry: 'observed' | 'unknown'; billedUsd: null;
}
export interface ManifestEntry { source: string; staged: string; sha256: string; bytes: number }
export interface TrialRecord {
  schema: 1; id: string; label: string; caseId: string; suite: Suite; config: 'candidate' | 'baseline';
  evidenceKind: 'live'; startedAt: string; model: string; runtime: 'codex-subscription';
  revision: { sha: string | null; dirty: boolean | null }; status: 'passed' | 'failed' | 'blocked';
  durationMs: number; reason: string | null; checks: { name: string; passed: boolean; detail: string }[];
  usage: { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; billedUsd: null; scope: string };
  rawEvents: string; rawStderr: string; outputFile: string; promptFile: string; manifestFile: string;
  toolCalls: number | null; delegations: number | null; manifestDigest: string;
  toolCallsScope?: 'emitted_root_tool_calls' | 'unknown';
  delegationsScope?: 'emitted_root_spawn_calls' | 'unknown';
  isolationMode: IsolationMode; isolationProof: unknown;
}
