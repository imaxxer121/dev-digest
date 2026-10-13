import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { api } from "@/lib/api";
import { AGENT_ID, CASE_ID, DIFF, RUN_A, RUN_B, evalBatch, frozenCase } from "@/test/eval-fixtures";
import { mountEval } from "@/test/eval-test-utils";
import { EvalsTab } from "./EvalsTab";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
function reads(records = [evalBatch()], cases = [frozenCase()]) {
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (path.endsWith("/eval-cases")) return { cases, unsupported: [] };
    if (path.endsWith("/eval-runs")) return records;
    if (path.startsWith("/eval-runs/")) return records.find((batch) => path.endsWith(batch.id));
    throw new Error(`Unexpected GET ${path}`);
  });
}

describe("Agent Evals tab", () => {
  it("loads immutable cases and inspects full stored inputs, prompts and outputs without inference", async () => {
    reads();
    const { container } = mountEval(<EvalsTab agentId={AGENT_ID} />);
    expect(await screen.findByText("Eval cases · 1")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Hardcoded key · must find/));
    expect(screen.getByText("Source PR #8 · accepted · 2026-10-13T10:00:00.000Z")).toBeVisible();
    expect(screen.getByText((_text, element) => element?.tagName === "PRE" && element.textContent === DIFF)).toBeVisible();
    expect(screen.getByText(/"source_head_sha": "frozen-sha"/)).toBeVisible();
    expect(screen.getByText(/Curator note excluded from inference/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Inspect run" }));
    const snapshot = await screen.findByRole("article", { name: `Stored snapshot ${RUN_A}` });
    expect(within(snapshot).getByText("Exact stored prompt A Second line with full content")).toBeVisible();
    fireEvent.click(within(snapshot).getByText(/Security rules · v3/));
    expect(within(snapshot).getByText("Full ordered skill body A")).toBeVisible();
    fireEvent.click(within(snapshot).getByText("Inspect complete immutable snapshot"));
    expect(within(snapshot).getByText(/"schema_json"/)).toBeVisible();
    fireEvent.click(within(snapshot).getByText("Inspect 1 stored group results and prompt assemblies"));
    expect(within(snapshot).getByText(/"raw_output": "Stored raw model output"/)).toBeVisible();
    expect(within(snapshot).getByText(/"reason": "outside diff"/)).toBeVisible();
    expect(container.textContent).toContain("Scoring is positional");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("runs only on an explicit action, keeps acknowledgement pending disabled and refreshes terminal progress", async () => {
    let started = false;
    let detailReads = 0;
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.endsWith("/eval-cases")) return { cases: [frozenCase()], unsupported: [] };
      if (path.endsWith("/eval-runs")) return started ? [evalBatch({ status: detailReads < 2 ? "running" : "completed" })] : [];
      if (path === `/eval-runs/${RUN_A}`) {
        detailReads += 1;
        return evalBatch({ status: detailReads < 2 ? "running" : "completed", completed_at: detailReads < 2 ? null : evalBatch().completed_at,
          groups_succeeded: detailReads < 2 ? 0 : 1, metrics: detailReads < 2 ? { recall: null, precision: null, citation_accuracy: null } : evalBatch().metrics });
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    vi.mocked(api.post).mockImplementation(async () => { started = true; return { batch_id: RUN_A, status: "running" }; });
    const { client } = mountEval(<EvalsTab agentId={AGENT_ID} />);
    const invalidations = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled());
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(await screen.findByRole("button", { name: "Running…" })).toBeDisabled();
    expect(api.post).toHaveBeenCalledWith(`/agents/${AGENT_ID}/eval-runs`);
    expect(await screen.findByText(/0 succeeded · 0 failed · 1 input groups/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled(), { timeout: 3500 });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-runs", AGENT_ID] });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-dashboard"] });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("blocks unsupported cases, distinguishes failure from empty, and retries the saved-case read", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.endsWith("/eval-runs")) return [];
      throw new Error("Case storage unavailable");
    });
    mountEval(<EvalsTab agentId={AGENT_ID} />);
    expect(await screen.findByText("Case storage unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.queryByText(/No frozen cases yet/)).not.toBeInTheDocument();
    vi.mocked(api.get).mockResolvedValue({ cases: [frozenCase()], unsupported: [{ id: CASE_ID, name: "Legacy input", reason: "Missing frozen metadata" }] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Legacy input · Missing frozen metadata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("compares two full saved prompts and suppresses deltas for a different suite", async () => {
    const first = evalBatch();
    const second = evalBatch({ id: RUN_B, config_digest: "b".repeat(64), metrics: { recall: 0.5, precision: 1, citation_accuracy: null },
      snapshot: { ...first.snapshot, config_digest: "b".repeat(64), agent: { ...first.snapshot.agent, system_prompt: "Exact stored prompt B\nAll content retained", version: 3 } } });
    reads([second, first]);
    const { client, container } = mountEval(<EvalsTab agentId={AGENT_ID} />);
    await screen.findByText("Eval cases · 1");
    fireEvent.change(screen.getByRole("combobox", { name: "Run A" }), { target: { value: RUN_A } });
    fireEvent.change(screen.getByRole("combobox", { name: "Run B" }), { target: { value: RUN_B } });
    expect(await screen.findByText(/Both runs use the same frozen dataset/)).toBeInTheDocument();
    expect(screen.getByText("Exact stored prompt A Second line with full content")).toBeVisible();
    expect(screen.getByText("Exact stored prompt B All content retained")).toBeVisible();
    expect(screen.getByText("+50.0 percentage points vs run A")).toBeVisible();
    expect(container.querySelector('[data-metric-delta="citation_accuracy"]')).toBeNull();
    client.setQueryData(["eval-batch", RUN_B], { ...second, comparison_key: "c".repeat(64), dataset_digest: "c".repeat(64), snapshot: { ...second.snapshot, comparison_key: "c".repeat(64), dataset_digest: "c".repeat(64) } });
    expect(await screen.findByText(/The dataset or scoring profile differs/)).toBeInTheDocument();
    expect(container.querySelector("[data-metric-delta]")).toBeNull();
    expect(screen.getByText("Exact stored prompt B All content retained")).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();
  });
});
