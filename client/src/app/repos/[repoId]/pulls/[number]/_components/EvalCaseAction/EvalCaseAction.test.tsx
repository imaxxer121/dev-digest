import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { api } from "@/lib/api";
import { AGENT_ID, DATE, FINDING_ID, frozenCase } from "@/test/eval-fixtures";
import { mountEval } from "@/test/eval-test-utils";
import { FindingCard } from "../FindingCard";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const finding: FindingRecord = { id: FINDING_ID, review_id: AGENT_ID, title: "Hardcoded key", file: "src/config.ts", start_line: 1, end_line: 1,
  severity: "CRITICAL", category: "security", rationale: "Secret in source", suggestion: null, confidence: 0.9,
  kind: "finding", evidence: null, trifecta_components: null, accepted_at: null, dismissed_at: null };

describe("Turn a persisted decision into an eval case", () => {
  it.each([["accepted_at", "Enter"], ["dismissed_at", " "]] as const)("opens a collapsed %s card by keyboard and reaches its conversion action", async (decision, key) => {
    vi.mocked(api.post).mockResolvedValue({ case: frozenCase(), created: true });
    mountEval(<FindingCard f={{ ...finding, [decision]: DATE }} repoFullName="owner/repo" headSha="frozen-sha" />);
    const expansion = screen.getByRole("button", { name: "Expand finding: Hardcoded key" });
    expansion.focus();
    expect(expansion).toHaveFocus();
    expect(expansion).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(expansion, { key });
    expect(expansion).toHaveAttribute("aria-expanded", "true");
    const action = screen.getByRole("button", { name: "Turn into eval case" });
    action.focus();
    expect(action).toHaveFocus();
    // JSDOM does not generate a native button click from Enter, so dispatch
    // the keyboard event and its browser-default click on the focused button.
    fireEvent.keyDown(action, { key: "Enter" });
    fireEvent.click(action);
    expect(await screen.findByText(/Frozen eval case created/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(`/findings/${FINDING_ID}/eval-case`);
    const link = screen.getByRole("link", { name: "src/config.ts:1" });
    fireEvent.keyDown(link, { key: "Enter" });
    expect(expansion).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(expansion, { key: " " });
    expect(expansion).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
  });

  it("requires one saved decision and performs no automatic conversion on mount", () => {
    const view = mountEval(<FindingCard f={finding} defaultExpanded />);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
    view.rerender(<FindingCard f={{ ...finding, accepted_at: DATE }} defaultExpanded pending />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
    view.rerender(<FindingCard f={{ ...finding, accepted_at: DATE }} defaultExpanded />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
    view.rerender(<FindingCard f={{ ...finding, dismissed_at: DATE }} defaultExpanded />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates explicitly, disables duplicate clicks, then shows idempotent saved-case feedback", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api.post).mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValue({ case: frozenCase(), created: false });
    const { client } = mountEval(<FindingCard f={{ ...finding, accepted_at: DATE }} defaultExpanded />);
    const invalidations = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByRole("button", { name: "Creating eval case…" })).toBeDisabled();
    expect(api.post).toHaveBeenCalledWith(`/findings/${FINDING_ID}/eval-case`);
    resolve({ case: frozenCase(), created: true });
    expect(await screen.findByText(/Frozen eval case created/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View agent evals" })).toHaveAttribute("href", `/agents/${AGENT_ID}?tab=evals`);
    expect(invalidations).toHaveBeenCalledWith({ queryKey: ["eval-cases", AGENT_ID] });
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText(/This frozen case already exists/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("keeps unsupported source errors visible and permits an explicit retry", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("409: Source trace has no recoverable diff"))
      .mockResolvedValue({ case: frozenCase(), created: true });
    mountEval(<FindingCard f={{ ...finding, dismissed_at: DATE }} defaultExpanded />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Source trace has no recoverable diff");
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(await screen.findByText(/Frozen eval case created/)).toBeInTheDocument();
  });
});
