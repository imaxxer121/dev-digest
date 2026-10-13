import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json
const state = vi.hoisted(() => ({ trace: vi.fn(), events: vi.fn() }));

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: (id: string, enabled: boolean) => { state.trace(id, enabled); return { data: TRACE, isLoading: false }; },
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: (ids: string[]) => { state.events(ids); return { events: [{ t: '12:00', kind: 'info', msg: 'Review currently running' }], running: false }; },
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    // COST stat card alongside DURATION / TOKENS / FINDINGS.
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
  it('waits for persisted terminal status even if SSE disconnects, then loads the exact completed findings', () => {
    state.trace.mockClear(); state.events.mockClear();
    const finding = { id: 'original-one', review_id: 'review-one', severity: 'CRITICAL' as const, category: 'security' as const, title: 'Original access finding',
      file: 'auth.ts', start_line: 2, end_line: 2, rationale: 'Original rationale', confidence: .95, accepted_at: null, dismissed_at: null };
    const element = (running: boolean) => <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <RunTraceDrawer runId="r1" agentName="Security" running={running} findings={running ? [] : [finding]} onClose={() => {}} />
    </NextIntlClientProvider>;
    const view = render(element(true));
    expect(state.trace).toHaveBeenLastCalledWith('r1', false); expect(state.events).toHaveBeenLastCalledWith(['r1']);
    expect(screen.getByText('Review currently running')).toBeInTheDocument();
    view.rerender(element(false)); expect(state.trace).toHaveBeenLastCalledWith('r1', true);
    fireEvent.click(screen.getByText('trace')); expect(screen.getByText('Original access finding')).toBeInTheDocument();
    expect(screen.queryByText('No findings for this run.')).not.toBeInTheDocument();
  });
});
