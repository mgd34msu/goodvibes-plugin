/**
 * goodvibes-connect MCP server, the registered HTTP/database server of the
 * single `goodvibes` plugin (three servers: intel, analytics, connect).
 *
 * Wires `core/proc` and `core/envelope` and serves the 3 tools (api_request,
 * service, db_query) over stdio under an explicit trust boundary. The envelope
 * carries connect's `mode: restricted|open` stamp from `core/config`; the
 * default is `restricted`.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { installProcessHygiene } from '@goodvibes/core/proc';
import { errorEnvelope, toCallToolResult } from '@goodvibes/core/envelope';
import { loadConfig, configForEnvelope } from '@goodvibes/core/config';
import { TOOLS, HANDLERS } from './tools/index.js';

export const SERVER_NAME = 'connect';
// Injected by build.mjs from plugin.json (the single version source);
// falls back in unbundled dev/test runs where no injection happens.
declare const __GV_VERSION__: string | undefined;
export const SERVER_VERSION = typeof __GV_VERSION__ !== 'undefined' ? __GV_VERSION__ : '0.0.0-dev';

/** Build the configured MCP server. `onActivity` resets the idle timer. */
export function createServer(onActivity?: () => void): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    onActivity?.();
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    onActivity?.();
    const handler = HANDLERS[request.params.name];
    if (handler) {
      return handler(request.params.arguments ?? {});
    }
    const { mode } = configForEnvelope(loadConfig());
    return toCallToolResult(
      errorEnvelope(`Unknown tool: ${request.params.name}.`, { mode }),
    );
  });

  return server;
}

/** Boot the server over stdio with the process-hygiene watchdogs installed. */
export async function main(): Promise<void> {
  const cfg = loadConfig();
  const hygiene = installProcessHygiene({
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
