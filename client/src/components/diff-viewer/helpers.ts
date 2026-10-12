/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const entry of patch.split("\n")) {
    const raw = entry.replace(/\r$/, "");
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
        inHunk = true;
      } else {
        inHunk = false;
      }
      out.push({ kind: "hunk", text: raw });
    } else if (inHunk && raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (inHunk && raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else if (inHunk && raw.startsWith(" ")) {
      out.push({ kind: "ctx", text: raw.slice(1), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}
