/**
 * goodvibes-connect MCP server — alpha scaffold.
 *
 * Wires `core/proc` and `core/envelope` and serves an EMPTY tools list — enough
 * that the bundle boots and answers an `initialize` request over stdio. The
 * trust boundary and 3 tools (api_request, service, db_query) land in lane 5.
 *
 * The envelope carries connect's `mode: restricted|open` stamp from
 * `core/config`; the alpha skeleton always reports `restricted`.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { installProcessHygiene } from '@goodvibes/core/proc';
import { errorEnvelope, toCallToolResult } from '@goodvibes/core/envelope';
import { loadConfig, configForEnvelope } from '@goodvibes/core/config';

export const SERVER_NAME = 'goodvibes-connect';
export const SERVER_VERSION = '2.0.0-alpha.1';

/** Build the configured MCP server. `onActivity` resets the idle timer. */
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
    const { mode } = configForEnvelope(loadConfig());
    return toCallToolResult(
      errorEnvelope(
        `Unknown tool: ${request.params.name}. The goodvibes-connect alpha skeleton serves no tools yet.`,
        { mode },
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

if (!process.env.VITEST) {
  void main().catch((err) => {
    console.error(`[${SERVER_NAME}] fatal:`, err);
    process.exit(1);
  });
}
