import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius as BlastRadiusData } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { api } from "@/lib/api";
import { BlastRadius } from "./BlastRadius";
import { OverviewTab } from "../OverviewTab";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const PR_ID = "22222222-2222-4222-8222-222222222222";
const SHA = "abc123456789abcdef";
const payload: BlastRadiusData = {
  changed_symbols: [{ name: "shared", file: "src/first.ts", kind: "function" }, { name: "shared", file: "src/second.ts", kind: "function" }],
  downstream: [
    { symbol: "shared", symbol_file: "src/first.ts", callers: [{ name: "usersRoute", file: "src/routes/ü users.ts", line: 17 }, { name: "commonConsumer", file: "src/common.ts", line: 8 }], endpoints_affected: ["GET /users"], crons_affected: ["nightly-sync"] },
    { symbol: "shared", symbol_file: "src/second.ts", callers: [{ name: "billingRoute", file: "src/routes/billing.ts", line: 25 }, { name: "commonConsumer", file: "src/common.ts", line: 8 }], endpoints_affected: ["POST /billing"], crons_affected: [] },
  ],
  summary: "2 symbols, 3 callers, 2 endpoints, 1 cron/job",
  counts: { symbols: 2, callers: 3, endpoints: 2, crons: 1 },
  degraded: false, reason: null, indexed_sha: SHA,
};

function mount(ui = <BlastRadius prId={PR_ID} repoFullName="owner/repo" headSha="different-head" />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ blast: messages }}>{ui}</NextIntlClientProvider></QueryClientProvider>);
}
function stat(container: HTMLElement, key: string) {
  return container.querySelector(`[data-blast-stat="${key}"]`) as HTMLElement;
}

describe("Blast radius on PR Overview", () => {
  it("shows server distinct counts, indexed links and per-file attribution for same-named symbols", async () => {
    vi.mocked(api.get).mockResolvedValue(payload);
    const { container } = mount();
    expect(await screen.findByText("src/routes/ü users.ts:17")).toHaveAttribute("href", `https://github.com/owner/repo/blob/${SHA}/src/routes/%C3%BC%20users.ts#L17`);
    expect(stat(container, "symbols")).toHaveTextContent("2symbols");
    expect(stat(container, "callers")).toHaveTextContent("3callers");
    expect(stat(container, "endpoints")).toHaveTextContent("2endpoints");
    expect(stat(container, "crons")).toHaveTextContent("1cron/jobs");
    expect(api.get).toHaveBeenCalledWith(`/pulls/${PR_ID}/blast`);
    expect(screen.getByText("Indexed snapshot · abc123456789")).toBeInTheDocument();
    expect(screen.getByText(/indexed snapshot differs/)).toBeInTheDocument();
    const first = screen.getByRole("region", { name: "Impact of shared in src/first.ts" });
    const second = screen.getByRole("region", { name: "Impact of shared in src/second.ts" });
    expect(within(first).getByText("usersRoute")).toBeInTheDocument();
    expect(within(first).queryByText("billingRoute")).not.toBeInTheDocument();
    expect(within(second).getByText("billingRoute")).toBeInTheDocument();
    expect(within(second).queryByText("usersRoute")).not.toBeInTheDocument();
    expect(within(first).getByRole("group", { name: /HTTP endpoints/ })).toHaveTextContent("GET /users");
    expect(within(first).getByRole("group", { name: /Cron\/jobs/ })).toHaveTextContent("nightly-sync");
    expect(within(second).getByRole("group", { name: /HTTP endpoints/ })).toHaveTextContent("POST /billing");
    expect(within(second).queryByText("nightly-sync")).not.toBeInTheDocument();
  });

  it("provides a clear no-callers state while retaining changed symbols and zero counts", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...payload, changed_symbols: [payload.changed_symbols[0]!], downstream: [{ ...payload.downstream[0]!, callers: [], endpoints_affected: [], crons_affected: [] }], counts: { symbols: 1, callers: 0, endpoints: 0, crons: 0 } });
    const { container } = mount();
    expect(await screen.findByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.getByText("shared")).toBeInTheDocument();
    expect(stat(container, "callers")).toHaveTextContent("0callers");
    expect(screen.getByText("No downstream callers found in the indexed files.")).toBeInTheDocument();
    expect(screen.queryByText("Incomplete repository index")).not.toBeInTheDocument();
  });

  it("retains useful partial data and states the actual incomplete-index reason", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...payload, degraded: true, reason: "index_partial" });
    mount();
    expect(await screen.findByText("Incomplete repository index")).toBeInTheDocument();
    expect(screen.getByText(/Only part of the repository was indexed/)).toBeInTheDocument();
    expect(screen.getByText("src/routes/ü users.ts:17")).toHaveAttribute("href", `https://github.com/owner/repo/blob/${SHA}/src/routes/%C3%BC%20users.ts#L17`);
    expect(screen.getByText("GET /users")).toBeInTheDocument();
  });

  it("does not present an empty degraded map as a conclusive no-callers result", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...payload, degraded: true, reason: "no_data", changed_symbols: [], downstream: [], counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } });
    mount();
    expect(await screen.findByText(/No usable repository index is available/)).toBeInTheDocument();
    expect(screen.getByText("No changed symbols are available in this incomplete index.")).toBeInTheDocument();
    expect(screen.queryByText(/no downstream callers found\./)).not.toBeInTheDocument();
  });

  it("renders plain references when indexed SHA is absent instead of guessing from PR head", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...payload, indexed_sha: null });
    mount();
    const reference = await screen.findByText("src/routes/ü users.ts:17");
    expect(reference.tagName).toBe("SPAN");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/source references are shown without links/)).toBeInTheDocument();
  });

  it("keeps loading and HTTP failure separate from empty results and retries without losing the description", async () => {
    let rejectRead!: (error: Error) => void;
    vi.mocked(api.get).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRead = reject; }));
    mount(<OverviewTab prId={PR_ID} repoFullName="owner/repo" headSha={SHA} prBody="Preserved PR description" />);
    expect(screen.getByText("Preserved PR description")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the indexed impact map");
    expect(screen.queryByText(/no downstream callers/)).not.toBeInTheDocument();
    rejectRead(new Error("Pull request was not found"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pull request was not found");
    expect(screen.queryByText("No indexed symbols were found in the changed files.")).not.toBeInTheDocument();
    vi.mocked(api.get).mockResolvedValue(payload);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("src/routes/ü users.ts:17")).toBeInTheDocument();
    expect(screen.getByText("Preserved PR description")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("collapses one symbol without changing top totals or another symbol’s map", async () => {
    vi.mocked(api.get).mockResolvedValue(payload);
    const { container } = mount();
    const first = await screen.findByRole("region", { name: "Impact of shared in src/first.ts" });
    const toggle = within(first).getByRole("button");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(first).queryByText("usersRoute")).not.toBeInTheDocument();
    expect(screen.getByText("billingRoute")).toBeInTheDocument();
    expect(stat(container, "callers")).toHaveTextContent("3callers");
    fireEvent.click(toggle);
    expect(within(first).getByText("usersRoute")).toBeInTheDocument();
  });

  it("shows an explicit full-index empty state and does not fetch without a PR identity", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...payload, changed_symbols: [], downstream: [], counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } });
    const { container } = mount();
    expect(await screen.findByText("No indexed symbols were found in the changed files.")).toBeInTheDocument();
    expect(stat(container, "symbols")).toHaveTextContent("0symbols");
    cleanup();
    vi.clearAllMocks();
    mount(<BlastRadius prId={null} repoFullName="owner/repo" />);
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Blast radius" })).not.toBeInTheDocument();
  });
});
