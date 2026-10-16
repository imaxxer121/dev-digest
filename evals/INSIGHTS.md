# Harness eval insights

## 2026-10-16 — Windows read-only policy and scoped data tools need distinct evidence

Installed CLI 0.162.0-alpha.17.2 confirmed its ChatGPT login using status only.
Its elevated Windows backend rejected snapshot-only read access; MXC was
unavailable. A fixed root-read probe denied writes but permitted loopback even
with command networking disabled. Strict mode therefore remains fail-closed.
The separately authorized explicit `mcp-readonly` mode passed physical-write and
MCP absolute/traversal/junction/oversize canaries, while recording unsupported OS
read/network claims (`src/runtime.ts:114`, `README.md:176`). Model shell and image
tools are disabled; the fixed server only returns staged allowlisted documents
(`assets/files-mcp.mjs:14`). Never infer broad OS isolation from read-only labels.

Verified deterministic commands: `npm test` passed 13/13 with zero skips;
`npm run typecheck` passed; `npm run eval:quality` reported 16 Skills, 11 agents,
8 cases and zero findings; `npm run eval:workflow` passed 8/8. The no-model
explicit fallback doctor passed and the default strict doctor failed as described.
Native execution was required for Windows process-tree termination fixtures.
No model was invoked by these checks. Live behavioral scores and apply-patch
tool-canary behavior remain root-owned evidence, not fixture claims.
