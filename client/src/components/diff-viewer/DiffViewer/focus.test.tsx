import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiffResponse } from "@devdigest/shared";
import brief from "../../../../messages/en/brief.json";
import prReview from "../../../../messages/en/prReview.json";
import shell from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";
import type { DiffFocusTarget } from "../focus";

const PATH = 'docs/ü [guide]".md';
const files: PrFile[] = [{ path: PATH, additions: 201, deletions: 0, patch: "@@ -1 +17,2 @@\n+first\n+second\n" }];
const groups: SmartDiffResponse["groups"] = [{ role: "docs", files: [{ ...files[0]!, finding_lines: [] }] }];
let scrolled: HTMLElement[];
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  scrolled = [];
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn(function (this: HTMLElement) { scrolled.push(this); }) });
});
afterEach(() => {
  cleanup();
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});
function view(target?: DiffFocusTarget | null, grouped = true, entries = files) {
  return <NextIntlClientProvider locale="en" messages={{ brief, prReview, shell }}>
    <DiffViewer files={entries} groups={grouped ? groups : undefined} focusTarget={target} />
  </NextIntlClientProvider>;
}

describe("diff focus from PR navigation", () => {
  it("opens a collapsed role and large special-character file, then scrolls/focuses the precise RIGHT row", async () => {
    const { container, rerender } = render(view());
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "false");
    rerender(view({ file: PATH, line: 18 }));
    await waitFor(() => expect(screen.getByRole("button", { name: PATH })).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "true");
    const row = container.querySelector('[data-diff-row="RIGHT:18"]') as HTMLElement;
    expect(scrolled.at(-1)).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(row).toHaveAttribute("data-diff-focused", "true");
    expect(scrolled).not.toContain(container.querySelector('[data-diff-row="RIGHT:17"]'));
    // Once handled, the reviewer can collapse it without a forced-open loop.
    fireEvent.click(screen.getByRole("button", { name: /^Docs / }));
    rerender(view({ file: PATH, line: 18 }));
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "false");
  });

  it("honors direct/reloaded targets and grouped/original remounts, then responds to a new target line", async () => {
    const target = { file: PATH, line: 17 };
    const { container, rerender, unmount } = render(view(target));
    expect(scrolled.at(-1)).toBe(container.querySelector('[data-diff-row="RIGHT:17"]'));
    rerender(view(target, false));
    expect(screen.queryByRole("button", { name: /^Docs / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: PATH })).toHaveAttribute("aria-expanded", "true");
    expect(scrolled.at(-1)).toBe(container.querySelector('[data-diff-row="RIGHT:17"]'));
    rerender(view({ file: PATH, line: 18 }, false));
    await waitFor(() => expect(scrolled.at(-1)).toBe(container.querySelector('[data-diff-row="RIGHT:18"]')));
    rerender(view(target));
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "true");
    unmount();
    const reloaded = render(view(target));
    expect(scrolled.at(-1)).toBe(reloaded.container.querySelector('[data-diff-row="RIGHT:17"]'));
  });

  it("uses the file header when the requested line exists only on LEFT and explains it", () => {
    const deletion: PrFile = { ...files[0]!, additions: 0, deletions: 201, patch: "@@ -17 +17,0 @@\n-deleted\n" };
    const { container } = render(view({ file: PATH, line: 17 }, false, [deletion]));
    const header = screen.getByRole("button", { name: PATH });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(scrolled.at(-1)).toBe(header);
    expect(document.activeElement).toBe(header);
    expect(screen.getByRole("status")).toHaveTextContent("Line 17 is not displayed");
    expect(container.querySelector('[data-diff-row="LEFT:17"]')).toBeInTheDocument();
    expect(container.querySelector("[data-diff-focused]")).not.toBeInTheDocument();
  });

  it("does not invent a row or scroll when an indexed caller file is outside the PR diff", () => {
    render(view({ file: "src/caller.ts", line: 44 }));
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR’s diff: src/caller.ts");
    expect(screen.getByRole("status")).toHaveTextContent("Caller lines belong to an indexed snapshot");
    expect(scrolled).toEqual([]);
    expect(screen.getByRole("button", { name: /^Docs / })).toHaveAttribute("aria-expanded", "false");
  });
});
