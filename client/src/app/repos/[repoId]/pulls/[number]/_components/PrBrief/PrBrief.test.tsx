import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { BriefResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { api } from "@/lib/api";
import { usePrBrief, useGeneratePrBrief } from "@/lib/hooks/brief";
import { briefResponse, savedBrief } from "@/test/brief-fixture";
import { PrBrief } from "./PrBrief";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; });
beforeEach(() => vi.clearAllMocks());

function Harness({ prId = "pr1", headSha = "head123", onFocus = vi.fn() }) {
  const query = usePrBrief(prId);
  const generate = useGeneratePrBrief(prId);
  return <PrBrief response={query.data} loading={query.isLoading} loadError={query.error} pending={generate.isPending}
    generationError={generate.error} headSha={headSha} repoId="repo1" onRetry={() => void query.refetch()}
    onGenerate={() => generate.mutate()} onFocus={onFocus} />;
}
function mount(props: React.ComponentProps<typeof Harness> = {}, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  clients.push(client);
  const view = (input: React.ComponentProps<typeof Harness>) => <QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ brief: messages }}><Harness {...input} /></NextIntlClientProvider></QueryClientProvider>;
  return { client, view, ...render(view(props)) };
}

describe("explicit PR brief generation and cache", () => {
  it("loads/reloads through GET without generating and keeps Intent in its independent card", async () => {
    vi.mocked(api.get).mockResolvedValue(briefResponse(null));
    const first = mount();
    const generate = await screen.findByRole("button", { name: "Generate brief" });
    await waitFor(() => expect(generate).toBeEnabled());
    expect(screen.getByRole("region", { name: "PR Brief" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "PR Intent" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project Context" })).toHaveAttribute("href", "/repos/repo1/context");
    expect(api.get).toHaveBeenCalledWith("/pulls/pr1/brief");
    expect(api.post).not.toHaveBeenCalled();
    first.unmount();
    mount();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("renders retained stale output, severity, explanation, scope and ordered keyboard focus actions", async () => {
    vi.mocked(api.get).mockResolvedValue(briefResponse(savedBrief, "new-head"));
    const onFocus = vi.fn();
    mount({ headSha: "new-head", onFocus });
    expect(await screen.findByText(savedBrief.summary)).toBeInTheDocument();
    expect(screen.getByText(/saved brief is stale/)).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText(savedBrief.risks.risks[0]!.explanation)).toBeInTheDocument();
    expect(screen.queryByText("Callback retries")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing UI")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "src/payment.ts:24 — Check the idempotency boundary" }));
    expect(onFocus).toHaveBeenLastCalledWith(savedBrief.review_focus[0]);
    fireEvent.click(screen.getByRole("button", { name: "src/payment.ts" }));
    expect(onFocus).toHaveBeenLastCalledWith({ file: "src/payment.ts", line: 24 });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("disables repeat action while pending, updates cache once and regenerates only explicitly", async () => {
    vi.mocked(api.get).mockResolvedValue(briefResponse(null));
    let resolve!: (result: BriefResponse) => void;
    vi.mocked(api.post).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { client } = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    const pending = await screen.findByRole("button", { name: "Generating…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(api.post).toHaveBeenCalledTimes(1);
    resolve(briefResponse());
    expect(await screen.findByText(savedBrief.summary)).toBeInTheDocument();
    expect(client.getQueryData(["pr-brief", "pr1"])).toEqual(briefResponse());
    expect(api.post).toHaveBeenCalledWith("/pulls/pr1/brief");
    vi.mocked(api.post).mockResolvedValueOnce(briefResponse({ ...savedBrief, summary: "A new explicit result" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("A new explicit result")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("retains the successful brief and query cache after a failed regeneration without retrying", async () => {
    vi.mocked(api.get).mockResolvedValue(briefResponse());
    vi.mocked(api.post).mockRejectedValue(new Error("Provider unavailable"));
    const { client } = mount();
    await screen.findByText(savedBrief.summary);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByText(savedBrief.summary)).toBeInTheDocument();
    expect(client.getQueryData(["pr-brief", "pr1"])).toEqual(briefResponse());
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  it("discloses missing files/Intent/issue, shortened specs and empty grounded output without claiming clean code", async () => {
    const brief = { ...savedBrief, intent: null, risks: { risks: [] }, review_focus: [], provenance: { ...savedBrief.provenance,
      intent: { ...savedBrief.provenance.intent, status: "missing" as const, total_count: 0, included_count: 0 },
      files: { ...savedBrief.provenance.files, status: "missing" as const, total_count: 0, included_count: 0 },
      specs: { ...savedBrief.provenance.specs, truncated: true, total_count: 2, included_count: 1 } } };
    vi.mocked(api.get).mockResolvedValue(briefResponse(brief));
    mount();
    expect(await screen.findByText("Saved Intent: missing")).toBeInTheDocument();
    expect(screen.getByText("Changed file facts: missing")).toBeInTheDocument();
    expect(screen.getByText(/Linked issue: missing/)).toBeInTheDocument();
    expect(screen.getByText(/shortened to fit the input budget/)).toBeInTheDocument();
    expect(screen.getByText(/No grounded risk references returned/)).toBeInTheDocument();
    expect(screen.getByText(/No review focus returned/)).toBeInTheDocument();
    expect(screen.getByText("specs/payments.md")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("keeps an old card after GET failure, and a current head prop marks it stale without POST", async () => {
    vi.mocked(api.get).mockResolvedValue(briefResponse());
    const { client, unmount } = mount();
    await screen.findByText(savedBrief.summary);
    vi.mocked(api.get).mockRejectedValue(new Error("Read unavailable"));
    await client.invalidateQueries({ queryKey: ["pr-brief", "pr1"] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Read unavailable");
    expect(screen.getByText(savedBrief.summary)).toBeInTheDocument();
    unmount();
    mount({ headSha: "moved-head" }, client);
    expect(await screen.findByText(/saved brief is stale/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("stores delayed generation under its original PR after navigation to another PR", async () => {
    vi.mocked(api.get).mockResolvedValue(briefResponse(null));
    let resolve!: (result: BriefResponse) => void;
    vi.mocked(api.post).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const mounted = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    await screen.findByRole("button", { name: "Generating…" });
    mounted.rerender(mounted.view({ prId: "pr2" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/pulls/pr2/brief"));
    resolve(briefResponse());
    await waitFor(() => expect(mounted.client.getQueryData(["pr-brief", "pr1"])).toEqual(briefResponse()));
    expect(mounted.client.getQueryData(["pr-brief", "pr2"])).toEqual(briefResponse(null));
    expect(screen.queryByText(savedBrief.summary)).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
