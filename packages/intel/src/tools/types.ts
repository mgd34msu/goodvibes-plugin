/**
 * Shared tool-registration shape for the goodvibes-intel server.
 *
 * One module per tool under `src/tools/`; each exports a `ToolDefinition`.
 * `src/index.ts` imports it and appends it to the `TOOLS` array — the whole
 * registration surface for a lane is one import line + one array entry, so
 * concurrent lanes touch disjoint lines in the shared file (see the carve-out
 * architecture §6 ownership discipline).
 */

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

/** A single registered tool: its MCP schema plus the handler that serves it. */
export interface ToolDefinition {
  /** The MCP `tools/list` entry (name, description, inputSchema). */
  definition: Tool;
  /** Serves a `tools/call` for this tool. Never throws — errors become an error envelope. */
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}
