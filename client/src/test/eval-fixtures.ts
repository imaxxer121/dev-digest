import type { EvalBatchDetail, FrozenEvalCase } from "@/vendor/shared/contracts/eval-pipeline";

export const AGENT_ID = "11111111-1111-4111-8111-111111111111";
export const SECOND_AGENT_ID = "99999999-9999-4999-8999-999999999999";
export const CASE_ID = "22222222-2222-4222-8222-222222222222";
export const FINDING_ID = "33333333-3333-4333-8333-333333333333";
export const RUN_A = "44444444-4444-4444-8444-444444444444";
export const RUN_B = "55555555-5555-4555-8555-555555555555";
export const DIGEST = "a".repeat(64);
export const DATE = "2026-10-13T10:00:00.000Z";
export const DIFF = "diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1 +1 @@\n-old\n+const key = 'secret';";

export function frozenCase(overrides: Partial<FrozenEvalCase> = {}): FrozenEvalCase {
  return {
    id: CASE_ID, owner_kind: "agent", owner_id: AGENT_ID, name: "Hardcoded key", input_diff: DIFF,
    input_files: [{ path: "src/config.ts", additions: 1, deletions: 1, hunks: [{ file: "src/config.ts", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, newLineNumbers: [1] }] }],
    input_meta: { version: 1, profile: "diff-only-v1", pr_title: "Config change", pr_description: null, input_digest: DIGEST,
      source: { workspace_id: AGENT_ID, repo_id: CASE_ID, pr_id: FINDING_ID, pr_number: 8, review_id: RUN_A, run_id: RUN_B,
        finding_id: FINDING_ID, agent_id: AGENT_ID, decision: "accepted", decision_at: DATE,
        source_head_sha: "frozen-sha", diff_digest: DIGEST, retrieval: "trace-source-diff" } },
    expected_output: { kind: "must_find", file: "src/config.ts", start_line: 1, end_line: 1 },
    notes: "Curator note excluded from inference", created_at: DATE, ...overrides,
  };
}

export function evalBatch(overrides: Partial<EvalBatchDetail> = {}): EvalBatchDetail {
  const item = frozenCase();
  return {
    id: RUN_A, agent_id: AGENT_ID, agent_name: "Security reviewer", status: "completed", started_at: DATE, completed_at: DATE,
    error: null, provider: "openai", model: "fixture-model", agent_version: 2, dataset_digest: DIGEST,
    config_digest: DIGEST, comparison_key: DIGEST, cases_total: 1, groups_total: 1, groups_succeeded: 1,
    groups_failed: 0, cases_passed: 1, cases_failed: 0,
    counts: { expected_positives: 1, true_positives: 1, false_negatives: 0, raw_candidates: 2, grounded_candidates: 1, false_positives: 1 },
    metrics: { recall: 1, precision: 0.5, citation_accuracy: 0.5 }, duration_ms: 120, cost_usd: null,
    snapshot: { version: 1,
      agent: { id: AGENT_ID, name: "Security reviewer", version: 2, provider: "openai", model: "fixture-model", system_prompt: "Exact stored prompt A\nSecond line with full content", strategy: "auto", output_schema: null, repo_intel: true, ci_fail_on: "critical" },
      skills: [{ id: CASE_ID, name: "Security rules", order: 0, version: 3, body: "Full ordered skill body A", digest: DIGEST, enabled: true }],
      cases: [item], groups: [{ input_digest: DIGEST, case_ids: [CASE_ID], input_diff: DIFF, input_files: item.input_files, pr_title: "Config change", pr_description: null }],
      profile: { id: "diff-only-v1", runner_version: "1", prompt_assembly_version: "1", scorer_version: "1", citation_gate_version: "1", effective_schema: "Review", schema_json: { type: "object" }, strategy: "single-pass", max_retries: 0, context: "frozen-diff-pr-skills" },
      dataset_digest: DIGEST, config_digest: DIGEST, comparison_key: DIGEST },
    groups: [{ input_digest: DIGEST, case_ids: [CASE_ID], status: "completed", error: null, candidates: [], grounded: [], rejected: [{ candidate_index: 1, reason: "outside diff" }],
      case_results: [{ case_id: CASE_ID, pass: true, matched_candidate_index: 0 }], counts: null, metrics: { recall: 1, precision: 0.5, citation_accuracy: 0.5 },
      prompt_assembly: null, raw_output: "Stored raw model output", structured_calls: 1, structured_attempts: 1, tokens_in: 120, tokens_out: 20, cost_usd: null, duration_ms: 120 }],
    ...overrides,
  };
}
