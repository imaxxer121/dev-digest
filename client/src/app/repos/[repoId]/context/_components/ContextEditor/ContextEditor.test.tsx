import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";
import { api } from "@/lib/api";
import { useContextFiles, useSaveContextFile } from "@/lib/hooks/core";
import { ContextEditor } from "./ContextEditor";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), put: vi.fn() } }));
const clients: QueryClient[] = [];
let stored: Map<string, SpecFile[]>;
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; });
beforeEach(() => {
  vi.clearAllMocks();
  stored = new Map();
  vi.mocked(api.get).mockImplementation(async (path) => stored.get(path) ?? []);
  vi.mocked(api.put).mockImplementation(async (path, data) => {
    const input = data as { path: string; content: string };
    const saved = { ...input, size: new TextEncoder().encode(input.content).length, updated_at: null };
    stored.set(path, [...(stored.get(path) ?? []).filter((file) => file.path !== saved.path), saved]);
    return saved;
  });
});
function Harness({ repoId = "repo1" }) {
  const files = useContextFiles(repoId);
  const save = useSaveContextFile(repoId);
  return <ContextEditor key={repoId} files={files.data ?? []} loading={files.isLoading} loadError={files.error}
    pending={save.isPending} saveError={save.error} onRetry={() => void files.refetch()}
    onSave={(input) => save.mutateAsync(input)} onResetError={() => save.reset()} />;
}
function mount(repoId = "repo1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = (repo: string) => <QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ context: messages }}><Harness repoId={repo} /></NextIntlClientProvider></QueryClientProvider>;
  return { ...render(view(repoId)), client, view };
}
function draft(path: string, content: string) {
  fireEvent.change(screen.getByLabelText("Logical path"), { target: { value: path } });
  fireEvent.change(screen.getByLabelText("Spec content"), { target: { value: content } });
}

describe("repository text context editor", () => {
  it("saves, reloads, edits and replaces one logical path via scoped GET/PUT without automatic saving", async () => {
    const first = mount();
    await screen.findByText("No spec files yet");
    expect(screen.getByText(/next explicit PR brief generation/)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    draft("specs/why.md", "Retries must remain safe — ✓");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved specs/why.md.")).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith("/repos/repo1/context", { path: "specs/why.md", content: "Retries must remain safe — ✓" });
    first.unmount();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit specs/why.md" }));
    expect(screen.getByLabelText("Spec content")).toHaveValue("Retries must remain safe — ✓");
    draft("specs/why.md", "Updated acceptance criteria");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved specs/why.md.");
    expect(stored.get("/repos/repo1/context")).toHaveLength(1);
    expect(stored.get("/repos/repo1/context")?.[0]?.content).toBe("Updated acceptance criteria");
    expect(api.put).toHaveBeenCalledTimes(2);
  });

  it("disables Save while pending, retains an errored draft, and prevents repeat submission", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.put).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    mount();
    await screen.findByText("No spec files yet");
    draft("specs/why.md", "Keep this draft");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const pending = await screen.findByRole("button", { name: "Saving…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(api.put).toHaveBeenCalledTimes(1);
    reject(new Error("Write unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is retained");
    expect(screen.getByLabelText("Spec content")).toHaveValue("Keep this draft");
    expect(screen.getByLabelText("Logical path")).toHaveValue("specs/why.md");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("validates logical paths and UTF-8 byte limits before PUT", async () => {
    mount();
    await screen.findByText("No spec files yet");
    draft("../outside.md", "Some text");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("relative POSIX path");
    expect(api.put).not.toHaveBeenCalled();
    draft("specs/unicode.md", "😀".repeat(16385));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("65,536 UTF-8 bytes");
    expect(api.put).not.toHaveBeenCalled();
  });

  it("uses a different repository cache and endpoint after navigation", async () => {
    stored.set("/repos/repo1/context", [{ path: "specs/first.md", content: "Private to first repo", size: 21, updated_at: null }]);
    const first = mount();
    await screen.findByText("specs/first.md");
    first.unmount();
    mount("repo2");
    await screen.findByText("No spec files yet");
    expect(screen.queryByText("specs/first.md")).not.toBeInTheDocument();
    draft("specs/second.md", "Second repo spec");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved specs/second.md.");
    expect(api.get).toHaveBeenCalledWith("/repos/repo2/context");
    expect(api.put).toHaveBeenCalledWith("/repos/repo2/context", { path: "specs/second.md", content: "Second repo spec" });
    expect(stored.get("/repos/repo1/context")?.[0]?.content).toBe("Private to first repo");
  });

  it("shows a loading state and recoverable GET error without an empty-result claim", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Read unavailable"));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved text specs");
    expect(await screen.findByRole("alert")).toHaveTextContent("Read unavailable");
    expect(screen.queryByText("No spec files yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("No spec files yet")).toBeInTheDocument());
    expect(api.put).not.toHaveBeenCalled();
  });

  it("writes a delayed save to its original repository cache after route navigation", async () => {
    let resolve!: (file: SpecFile) => void;
    vi.mocked(api.put).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const mounted = mount();
    await screen.findByText("No spec files yet");
    draft("specs/first.md", "First repository spec");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving…" });
    mounted.rerender(mounted.view("repo2"));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/repos/repo2/context"));
    expect(screen.getByLabelText("Logical path")).toHaveValue("");
    resolve({ path: "specs/first.md", content: "First repository spec", size: 21, updated_at: null });
    await waitFor(() => expect(mounted.client.getQueryData<SpecFile[]>(["context", "repo1"])?.[0]?.path).toBe("specs/first.md"));
    expect(mounted.client.getQueryData(["context", "repo2"])).toEqual([]);
    expect(screen.queryByRole("button", { name: "Edit specs/first.md" })).not.toBeInTheDocument();
  });
});
