# DevDigest Blast Radius MCP

This independent package exposes one read-only stdio tool, `get_blast_radius`.
It forwards the existing `GET /pulls/:id/blast` document, including counts,
degradation reason and indexed SHA. It does not parse a repository, index files,
run a review or call a model. The earlier lab's other tools are outside this
package's scope.

Use Node.js **22.12 or later**. Server and client are separate applications;
start the DevDigest API on port 3001 with a prepared repository index first.
From this directory:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm start
```

`npm start` waits for an MCP client on stdin; stdout is reserved for the protocol.
`DEVDIGEST_API_URL` defaults to `http://127.0.0.1:3001`. Set it in the client
configuration to use another API. The operator owns that base URL; tool input
cannot select a destination. Requests have a ten-second timeout, reject redirects,
validate the backend document and return useful HTTP/network/shape errors.
No model API key is required by this server.

## Client configuration

The repository's `.mcp.json` is a project configuration for clients supporting
that format. Build this package first and start the client from the repository
root. For a client with another working directory, use an absolute path:

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["C:/path/to/dev-digest/devdigest-mcp/dist/index.js"],
      "env": { "DEVDIGEST_API_URL": "http://127.0.0.1:3001" }
    }
  }
}
```

Codex CLI uses its own MCP configuration format; see the
[official MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
The L04 demonstration used invocation-scoped Codex configuration and the existing
CLI login, without changing the user's global configuration. Claude Code was
unavailable and was **not tested**; this configuration is provided for a later
Claude/client run, not as evidence that such a run occurred.

## Arguments and actual-process verification

`pr_id` is a **local DevDigest UUID**, obtained from
`GET /repos/:repoId/pulls`. It is not the GitHub number. For example:

```json
{ "pr_id": "6c5fdc55-3bf4-4e45-a678-f1c9a60de1bc" }
```

Import and index the PR in the API before calling the tool. The output's
`indexed_sha` identifies the cached snapshot; potential endpoint/cron impact is
static evidence, not a proof of runtime invocation.

After building, verify the real stdio process against a running API. Supply one
indexed PR and one documentation-only PR from **your local database**:

```sh
node scripts/verify-live.mjs <pr_uuid> <empty_pr_uuid> ./parity.json
```

This SDK client performs initialize → listTools → callTool, checks
`readOnlyHint: true`, deeply compares both MCP representations with HTTP, checks
the empty map, and checks an unknown UUID's error. It needs no model subscription
or model API key. Unit tests use injected HTTP responses; this script exercises
an actual server process. The recorded L04 run is in
[`../docs/evidence/l04/mcp-parity.json`](../docs/evidence/l04/mcp-parity.json).

The implementation follows the installed TypeScript SDK **2.3.1** APIs:
[server registration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/first-server.md)
and [stdio transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md).
