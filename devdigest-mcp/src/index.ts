import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

// stdout belongs exclusively to the MCP protocol. No API keys or LLM provider needed.
void serveStdio(() => createServer());
