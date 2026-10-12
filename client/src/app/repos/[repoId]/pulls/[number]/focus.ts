import type { DiffFocusTarget } from "@/components/diff-viewer";

export function readDiffFocus(search: URLSearchParams): DiffFocusTarget | null {
  const file = search.get("file");
  const rawLine = search.get("line");
  const line = rawLine && /^\d+$/.test(rawLine) ? Number(rawLine) : NaN;
  return file && Number.isSafeInteger(line) && line > 0 ? { file, line } : null;
}

export function diffFocusHref(repoId: string, number: string, search: URLSearchParams, target: DiffFocusTarget) {
  const params = new URLSearchParams(search);
  params.set("tab", "diff");
  params.set("file", target.file);
  params.set("line", String(target.line));
  return `/repos/${repoId}/pulls/${number}?${params.toString()}`;
}
