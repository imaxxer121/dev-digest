import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@devdigest/shared";
import { api } from "../api";
import { usePullDetail, usePulls } from "./core";
import { usePrBrief } from "./brief";
import { briefResponse, savedBrief } from "@/test/brief-fixture";

vi.mock("../api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PR head cache refresh", () => {
  it("refreshes detail and saved-brief freshness when a list read discovers a new head, without POST", async () => {
    let currentHead = "head123";
    const meta: PrMeta = { id: "pr1", number: 1, title: "Payment retry", author: "reviewer", branch: "fix", base: "main",
      head_sha: currentHead, additions: 1, deletions: 0, files_count: 1, status: "open" };
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path === "/repos/repo1/pulls") return [{ ...meta, head_sha: currentHead }];
      if (path === "/pulls/pr1/brief") return briefResponse(savedBrief, currentHead);
      if (path === "/pulls/pr1") return { head_sha: currentHead };
      throw new Error(path);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["smart-diff", "pr1"], { groups: [] });
    client.setQueryData(["blast-radius", "pr1"], { summary: "Old snapshot" });
    function Harness() {
      usePulls("repo1");
      const detail = usePullDetail("pr1");
      const brief = usePrBrief("pr1");
      return <><p>Detail: {detail.data?.head_sha}</p><p>{brief.data?.stale ? "Saved brief is stale" : "Saved brief is current"}</p></>;
    }
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    await screen.findByText("Detail: head123");
    await waitFor(() => expect(client.getQueryData(["pulls", "repo1"])).toEqual([meta]));
    currentHead = "moved-head";
    await client.invalidateQueries({ queryKey: ["pulls", "repo1"] });
    expect(await screen.findByText("Detail: moved-head")).toBeInTheDocument();
    expect(await screen.findByText("Saved brief is stale")).toBeInTheDocument();
    expect(client.getQueryState(["smart-diff", "pr1"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["blast-radius", "pr1"])?.isInvalidated).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
    client.clear();
  });
});
