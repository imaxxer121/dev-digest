import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { IntentResponse } from "@/vendor/shared/contracts/review-api";
import messages from "../../../../../../../../messages/en/intent.json";
import { api } from "@/lib/api";
import { IntentCard } from "./IntentCard";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
beforeEach(() => vi.clearAllMocks());
const missing: IntentResponse = { intent: null, current_head_sha: "h0", freshness: "missing" };
const saved: IntentResponse = { ...missing, freshness: "current", intent: { pr_id: "pr1", intent: "Bound queued retries",
  in_scope: ["Retry policy"], out_of_scope: ["Billing UI"], generation_id: "g0", head_sha: "h0", generated_at: "2026-10-16T00:00:00.000Z",
  provider: "codex", model: "fixture", tokens_in: 12, tokens_out: 8, cost_usd: null } };
function mount(props = { prId: "pr1" as string | null, headSha: "h0" as string | null }, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  clients.push(client);
  const view = (input: typeof props) => <QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ intent: messages }}><IntentCard {...input} /></NextIntlClientProvider></QueryClientProvider>;
  return { client, view, ...render(view(props)) };
}
describe("independent stored PR Intent", () => {
  it("is useful before Brief exists and opening/reloading only GETs saved state", async () => {
    vi.mocked(api.get).mockResolvedValue(missing);
    const first = mount();
    expect(await screen.findByText(/No saved Intent/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "PR Intent" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/pulls/pr1/intent");
    expect(api.post).not.toHaveBeenCalled();
    first.unmount(); mount();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.post).not.toHaveBeenCalled();
  });
  it("POSTs only on explicit action, disables repeats while pending and renders both scope lists", async () => {
    vi.mocked(api.get).mockResolvedValue(missing);
    let finish!: (value: IntentResponse) => void;
    vi.mocked(api.post).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { client } = mount();
    const action = await screen.findByRole("button", { name: "Recalculate Intent" });
    await waitFor(() => expect(action).toBeEnabled()); fireEvent.click(action);
    const pending = await screen.findByRole("button", { name: "Recalculating…" });
    expect(pending).toBeDisabled(); fireEvent.click(pending);
    expect(api.post).toHaveBeenCalledTimes(1); expect(api.post).toHaveBeenCalledWith("/pulls/pr1/intent/recalculate");
    finish(saved);
    expect(await screen.findByText("Bound queued retries")).toBeInTheDocument();
    expect(screen.getByText("Retry policy")).toBeInTheDocument(); expect(screen.getByText("Billing UI")).toBeInTheDocument();
    expect(client.getQueryData(["pr-intent", "pr1"])).toEqual(saved);
  });
  it("retains saved success on failed recalculation, with stale/unknown states independent of Brief", async () => {
    vi.mocked(api.get).mockResolvedValue(saved); vi.mocked(api.post).mockRejectedValue(new Error("Provider unavailable"));
    const mounted = mount({ prId: "pr1", headSha: "h1" });
    expect(await screen.findByText("Bound queued retries")).toBeInTheDocument();
    expect(screen.getByText(/saved Intent is stale/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recalculate Intent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByText("Bound queued retries")).toBeInTheDocument(); expect(api.post).toHaveBeenCalledTimes(1);
    mounted.unmount();
    vi.mocked(api.get).mockResolvedValue({ ...saved, freshness: "unknown", intent: { ...saved.intent!, head_sha: null } });
    mount();
    expect(await screen.findByText(/freshness is unknown/)).toBeInTheDocument();
  });
  it("a failed read can be retried without inference and empty scopes are explicit", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Read failed")).mockResolvedValue({ ...saved, intent: { ...saved.intent!, in_scope: [], out_of_scope: [] } });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Read failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByText("No scope claims recorded.")).toHaveLength(2);
    expect(api.post).not.toHaveBeenCalled();
  });
  it("keeps authoritative stale state even while the parent page still has the old head", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...saved, current_head_sha: "h1", freshness: "stale" });
    mount({ prId: "pr1", headSha: "h0" });
    expect(await screen.findByText(/saved Intent is stale/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
  it("stores a delayed recalculation under its original PR after navigation", async () => {
    vi.mocked(api.get).mockResolvedValue(missing);
    let finish!: (value: IntentResponse) => void;
    vi.mocked(api.post).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const mounted = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Recalculate Intent" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Recalculate Intent" }));
    await screen.findByRole("button", { name: "Recalculating…" });
    mounted.rerender(mounted.view({ prId: "pr2", headSha: "h0" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/pulls/pr2/intent"));
    finish(saved);
    await waitFor(() => expect(mounted.client.getQueryData(["pr-intent", "pr1"])).toEqual(saved));
    expect(mounted.client.getQueryData(["pr-intent", "pr2"])).toEqual(missing);
    expect(screen.queryByText("Bound queued retries")).not.toBeInTheDocument();
  });
});
