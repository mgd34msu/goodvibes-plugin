/**
 * goodvibes-intel MCP server — alpha scaffold.
 *
 * Wires `core/proc` (process hygiene) and `core/envelope` (response shape) and
 * serves an EMPTY tools list — enough that the bundle boots and answers an
 * `initialize` request over stdio. The 14 intel tools land in lanes 1–4.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { installProcessHygiene } from '@goodvibes/core/proc';
import { errorEnvelope, toCallToolResult } from '@goodvibes/core/envelope';
import { loadConfig } from '@goodvibes/core/config';

export const SERVER_NAME = 'goodvibes-intel';
export const SERVER_VERSION = '2.0.0-alpha.1';

/**
 * Build the configured MCP server. `onActivity` is invoked on every request so
 * the process-hygiene idle timer can be reset.
 */
export function createServer(onActivity?: () => void): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    onActivity?.();
    return { tools: [] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    onActivity?.();
    return toCallToolResult(
      errorEnvelope(
        `Unknown tool: ${request.params.name}. The goodvibes-intel alpha skeleton serves no tools yet.`,
      ),
    );
  });

  return server;
}

/** Boot the server over stdio with the process-hygiene watchdogs installed. */
export async function main(): Promise<void> {
  const cfg = loadConfig();
  const hygiene = installProcessHygiene({
    idleExitMinutes: cfg.idle_exit_minutes,
    ppidPollMs: cfg.ppid_poll_ms,
  });
  const server = createServer(() => hygiene.noteActivity());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Bootstrap only when run as the process entry — never when imported by tests.
if (!process.env.VITEST) {
  void main().catch((err) => {
    console.error(`[${SERVER_NAME}] fatal:`, err);
    process.exit(1);
  });
}
