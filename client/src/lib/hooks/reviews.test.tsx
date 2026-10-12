import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunSummary } from "@devdigest/shared";
import { api } from "../api";
import { useDeleteReview, useDeleteRun, useFindingAction, usePrReviewRefresh, usePrRuns, usePrActiveRuns, useRunReview, type ActiveRun } from "./reviews";

vi.mock("../api", () => ({ API_BASE: "http://test", api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } }));
vi.mock("../toast", () => ({ notify: { error: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.post).mockResolvedValue({}); vi.mocked(api.del).mockResolvedValue({ ok: true }); });
function harness() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, invalidate };
}
function run(status: string): RunSummary { return { run_id: "run1", status } as RunSummary; }
const active: ActiveRun[] = [{ run_id: "run1", agent_id: null, agent_name: null, ran_at: null }];

describe("Smart Diff cache lifecycle", () => {
  it("refreshes reviews and grouping when background runs are acknowledged", async () => {
    const { wrapper, invalidate } = harness();
    const { result } = renderHook(() => useRunReview(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ prId: "p1" }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "p1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-runs", "p1"] });
  });

  it("polls actual run history and refreshes a completion whose running state was never observed", async () => {
    vi.useFakeTimers();
    let serverRuns: RunSummary[] = [];
    vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/active") ? [] : serverRuns);
    const { wrapper, invalidate } = harness();
    const { result, unmount } = renderHook(() => {
      const runs = usePrRuns("p1");
      const activeRuns = usePrActiveRuns("p1");
      usePrReviewRefresh("p1", runs.data, activeRuns.data);
      return runs;
    }, { wrapper });
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(result.current.data).toEqual([]);
      invalidate.mockClear();
      serverRuns = [run("done")];
      await act(async () => { await vi.advanceTimersByTimeAsync(4010); });
      expect(result.current.data?.[0]?.status).toBe("done");
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "p1"] });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("a page observer refreshes after terminal polling or active-run disappearance regardless of tab", async () => {
    const { wrapper, invalidate } = harness();
    const { rerender } = renderHook(({ runs, activeRuns }) => usePrReviewRefresh("p1", runs, activeRuns), {
      wrapper, initialProps: { runs: [run("running")], activeRuns: active },
    });
    expect(invalidate).not.toHaveBeenCalled();
    rerender({ runs: [run("running")], activeRuns: [] });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "p1"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-runs", "p1"] });
    invalidate.mockClear();
    rerender({ runs: [run("done")], activeRuns: [] });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] }));
    invalidate.mockClear();
    rerender({ runs: [run("done")], activeRuns: [] });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("finding actions and either kind of deletion invalidate both representations", async () => {
    const { wrapper, invalidate } = harness();
    const { result } = renderHook(() => ({ finding: useFindingAction(), review: useDeleteReview("p1"), run: useDeleteRun("p1") }), { wrapper });
    for (const perform of [
      () => result.current.finding.mutateAsync({ findingId: "f1", action: "accept", prId: "p1" }),
      () => result.current.review.mutateAsync("review1"),
      () => result.current.run.mutateAsync("run1"),
    ]) {
      invalidate.mockClear();
      await act(async () => { await perform(); });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "p1"] });
    }
  });
});
