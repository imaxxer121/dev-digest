import type { BriefResponse, BriefSource, PrBrief } from "@devdigest/shared";

function source(name: string, status: BriefSource["status"] = "available", reason: string | null = null): BriefSource {
  return { source: name, status, reason, truncated: false, total_count: status === "available" ? 1 : 0, included_count: status === "available" ? 1 : 0 };
}

export const savedBrief: PrBrief = {
  version: 1, head_sha: "head123", generated_at: "2026-10-12T10:00:00.000Z",
  summary: "Protect checkout from duplicate callbacks.",
  review_focus: [{ file: "src/payment.ts", line: 24, reason: "Check the idempotency boundary" }],
  intent: { intent: "Keep retries safe", in_scope: ["Callback retries"], out_of_scope: ["Billing UI"] },
  blast: null,
  risks: { risks: [{ kind: "behavior", title: "Repeated payment", explanation: "A retry can repeat the external write; check idempotency.", severity: "high", file_refs: ["src/payment.ts"] }] },
  history: { history: [] },
  provenance: {
    description: source("persisted-pr"), intent: source("pr_intent"), blast: source("persisted-repo-intel", "unavailable", "no_data"),
    files: source("pr_files"), linked_issue: source("github-issue", "missing", "not_linked"), specs: source("code_chunks:spec"),
    intent_sha_coverage: "unknown", indexed_sha: null,
    specs_included: [{ path: "specs/payments.md", digest: "a".repeat(64), original_bytes: 80, included_bytes: 80 }],
  },
  generation: {
    call_id: "11111111-1111-4111-8111-111111111111", provider: "codex", model: "fixture-model", application_calls: 1, attempts: 1,
    measured_payload_bytes: 4096, adapter_framing_allowance_bytes: 1024, budgeted_input_bytes: 5120, input_budget_bytes: 32000, budget_unit: "utf8_bytes",
    tokens_in: 900, tokens_out: 200, cost_usd: null, duration_ms: 1000, discarded_refs: 0, discarded_risks: 0, discarded_focus: 0,
  },
};

export function briefResponse(brief: PrBrief | null = savedBrief, currentHead = "head123"): BriefResponse {
  return { brief, current_head_sha: currentHead, stale: !!brief && brief.head_sha !== currentHead };
}
