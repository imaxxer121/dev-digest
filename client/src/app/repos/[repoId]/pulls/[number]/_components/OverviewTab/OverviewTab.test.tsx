import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/intent.json";
import brief from "../../../../../../../../messages/en/brief.json";
import blast from "../../../../../../../../messages/en/blast.json";
import { api } from "@/lib/api";
import { OverviewTab } from "./OverviewTab";
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
it("mounts an independent Intent card before an absent Brief and reads without generating", async () => {
  vi.mocked(api.get).mockImplementation(async path => path.endsWith("/intent")
    ? { intent: null, current_head_sha: "h0", freshness: "missing" }
    : { changed_symbols: [], downstream: [], summary: "", degraded: true, reason: "no_data", indexed_sha: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ intent: messages, brief, blast }}>
    <OverviewTab prId="pr1" headSha="h0" prBody={null} brief={{ loading: false, pending: false, repoId: "repo1", onGenerate: vi.fn(), onRetry: vi.fn(), onFocus: vi.fn() }} />
  </NextIntlClientProvider></QueryClientProvider>);
  expect(await screen.findByText(/No saved Intent/)).toBeInTheDocument();
  expect(screen.getAllByRole("region").slice(0, 2).map(element => element.getAttribute("aria-label"))).toEqual(["PR Intent", "PR Brief"]);
  expect(screen.getByRole("region", { name: "PR Brief" })).toHaveTextContent("Generate a brief explicitly");
  expect(api.get).toHaveBeenCalledWith("/pulls/pr1/intent"); expect(api.post).not.toHaveBeenCalled();
  client.clear();
});
