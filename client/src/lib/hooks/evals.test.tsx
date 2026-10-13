import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import { AGENT_ID, SECOND_AGENT_ID, RUN_A, evalBatch, frozenCase } from "@/test/eval-fixtures";
import { evalTestClient, evalTestWrapper } from "@/test/eval-test-utils";
import { useAgentEvalCases, useConvertFindingToEval, useEvalBatch, useRunAgentEvals } from "./evals";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("Eval query and mutation lifecycle", () => {
  it("invalidates the originating agent when navigation occurs during a run acknowledgement", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((done) => { resolve = done; }));
    const client = evalTestClient();
    const invalidations = vi.spyOn(client, "invalidateQueries");
    const { result, rerender } = renderHook(({ agentId }) => ({ agentId, start: useRunAgentEvals() }), { initialProps: { agentId: AGENT_ID }, wrapper: evalTestWrapper(client) });
    act(() => result.current.start.mutate({ agentId: result.current.agentId }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/agents/${AGENT_ID}/eval-runs`));
    rerender({ agentId: SECOND_AGENT_ID });
    await act(async () => { resolve({ batch_id: RUN_A, status: "running" }); });
    await waitFor(() => expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-runs", AGENT_ID] }));
    expect(invalidations).not.toHaveBeenCalledWith({ queryKey: ["eval-runs", SECOND_AGENT_ID] });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-dashboard"] });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("uses the converted case's server owner and rejects malformed case responses", async () => {
    vi.mocked(api.post).mockResolvedValue({ case: frozenCase({ owner_id: SECOND_AGENT_ID }), created: false });
    const client = evalTestClient();
    const invalidations = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useConvertFindingToEval(), { wrapper: evalTestWrapper(client) });
    await act(async () => { await result.current.mutateAsync({ findingId: frozenCase().input_meta.source.finding_id }); });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-cases", SECOND_AGENT_ID] });
    expect(invalidations).not.toHaveBeenCalledWith({ queryKey: ["eval-cases", AGENT_ID] });
    vi.mocked(api.get).mockResolvedValue({ cases: [{ id: "legacy-invalid" }], unsupported: [] });
    const cases = renderHook(() => useAgentEvalCases(AGENT_ID), { wrapper: evalTestWrapper(client) });
    await waitFor(() => expect(cases.result.current.isError).toBe(true));
    expect(cases.result.current.data).toBeUndefined();
  });

  it("polls running detail to terminal and refreshes history using stored ownership", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(evalBatch({ status: "running", completed_at: null, agent_id: SECOND_AGENT_ID }))
      .mockResolvedValue(evalBatch({ agent_id: SECOND_AGENT_ID }));
    const client = evalTestClient();
    const invalidations = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useEvalBatch(RUN_A), { wrapper: evalTestWrapper(client) });
    await waitFor(() => expect(result.current.data?.status).toBe("running"));
    await waitFor(() => expect(result.current.data?.status).toBe("completed"), { timeout: 3000 });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-runs", SECOND_AGENT_ID] });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-dashboard"] });
    expect(api.post).not.toHaveBeenCalled();
  });
});
