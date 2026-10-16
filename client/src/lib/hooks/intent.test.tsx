import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { api } from "@/lib/api";
import { IntentResponse } from "@/vendor/shared/contracts/review-api";
import { IntentCard } from "@/app/repos/[repoId]/pulls/[number]/_components/IntentCard";
import intentMessages from "../../../messages/en/intent.json";
import { usePrIntent } from "./intent";
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Intent read contract", () => {
  it("rejects malformed responses and never POSTs for disabled/missing identities", async () => {
    vi.mocked(api.get).mockResolvedValue({ intent: "wrong" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const query = renderHook(() => usePrIntent("pr"), { wrapper });
    await waitFor(() => expect(query.result.current.isError).toBe(true));
    const disabled = renderHook(() => usePrIntent(null), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(api.get).toHaveBeenCalledTimes(1); expect(api.post).not.toHaveBeenCalled();
    client.clear();
  });
  const saved = (prId: string, purpose: string) => IntentResponse.parse({
    intent: { pr_id: prId, intent: purpose, in_scope: [], out_of_scope: [] },
    current_head_sha: "head", freshness: "unknown",
  });
  function card(client: QueryClient, prId: string) {
    return <QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ intent: intentMessages }}>
      <IntentCard prId={prId} />
    </NextIntlClientProvider></QueryClientProvider>;
  }
  it("a late background GET cannot replace a successful recalculation in the cache or visible card", async () => {
    const oldIntent = saved("pr1", "Old saved purpose"), newIntent = saved("pr1", "New explicit purpose");
    let finishRead!: (value: IntentResponse) => void, finishPost!: (value: IntentResponse) => void;
    const delayedRead = new Promise<IntentResponse>(resolve => { finishRead = resolve; });
    vi.mocked(api.get).mockResolvedValueOnce(oldIntent).mockReturnValueOnce(delayedRead);
    vi.mocked(api.post).mockReturnValueOnce(new Promise(resolve => { finishPost = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(card(client, "pr1"));
    expect(await screen.findByText(oldIntent.intent!.intent)).toBeInTheDocument();
    act(() => { void client.refetchQueries({ queryKey: ["pr-intent", "pr1"], exact: true }); });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(client.getQueryState(["pr-intent", "pr1"])?.fetchStatus).toBe("fetching");
    fireEvent.click(screen.getByRole("button", { name: "Recalculate Intent" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/pulls/pr1/intent/recalculate"));
    await act(async () => { finishPost(newIntent); });
    expect(await screen.findByText(newIntent.intent!.intent)).toBeInTheDocument();
    await act(async () => { finishRead(oldIntent); await delayedRead; });
    await waitFor(() => expect(client.getQueryState(["pr-intent", "pr1"])?.fetchStatus).toBe("idle"));
    expect(client.getQueryData(["pr-intent", "pr1"])).toEqual(newIntent);
    expect(screen.getByText(newIntent.intent!.intent)).toBeInTheDocument();
    expect(screen.queryByText(oldIntent.intent!.intent)).not.toBeInTheDocument();
    client.clear();
  });
  it("navigation keeps cancellation and the successful write scoped to the mutation's original PR", async () => {
    const oldIntent = saved("pr1", "Original PR purpose"), newIntent = saved("pr1", "Recalculated original purpose");
    const otherIntent = saved("pr2", "Other PR purpose"), refreshedOther = saved("pr2", "Refreshed other PR purpose");
    let finishOldRead!: (value: IntentResponse) => void, finishOtherRead!: (value: IntentResponse) => void, finishPost!: (value: IntentResponse) => void;
    const oldRead = new Promise<IntentResponse>(resolve => { finishOldRead = resolve; });
    const otherRead = new Promise<IntentResponse>(resolve => { finishOtherRead = resolve; });
    let originalReads = 0;
    vi.mocked(api.get).mockImplementation(path => path === "/pulls/pr1/intent" ? (++originalReads === 1 ? Promise.resolve(oldIntent) : oldRead) : otherRead);
    vi.mocked(api.post).mockReturnValueOnce(new Promise(resolve => { finishPost = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(["pr-intent", "pr2"], otherIntent);
    const unrelated = { brief: "Preserve unrelated cached data" };
    client.setQueryData(["pr-brief", "pr1"], unrelated);
    const view = render(card(client, "pr1"));
    await screen.findByText(oldIntent.intent!.intent);
    act(() => { void client.refetchQueries({ queryKey: ["pr-intent", "pr1"], exact: true }); });
    await waitFor(() => expect(originalReads).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Recalculate Intent" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    view.rerender(card(client, "pr2"));
    expect(await screen.findByText(otherIntent.intent!.intent)).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/pulls/pr2/intent"));
    await act(async () => { finishPost(newIntent); });
    await waitFor(() => expect(client.getQueryData(["pr-intent", "pr1"])).toEqual(newIntent));
    expect(client.getQueryState(["pr-intent", "pr2"])?.fetchStatus).toBe("fetching");
    await act(async () => { finishOldRead(oldIntent); await oldRead; });
    expect(client.getQueryData(["pr-intent", "pr1"])).toEqual(newIntent);
    expect(client.getQueryData(["pr-intent", "pr2"])).toEqual(otherIntent);
    expect(screen.queryByText(newIntent.intent!.intent)).not.toBeInTheDocument();
    await act(async () => { finishOtherRead(refreshedOther); await otherRead; });
    expect(await screen.findByText(refreshedOther.intent!.intent)).toBeInTheDocument();
    expect(client.getQueryData(["pr-brief", "pr1"])).toEqual(unrelated);
    client.clear();
  });
});
