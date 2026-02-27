/**
 * Runtime Engine — Server Entry Point
 *
 * This is the executable entry point for the runtime-engine MCP server.
 * It instantiates RuntimeEngineServer and starts it.
 *
 * The library surface (config, types, utilities, persistence) is exported
 * separately from src/index.ts for use by other engine subsystems.
 */

import { RuntimeEngineServer } from './plugins/mcp/mcp-server.js';
import { toErrorMessage } from './shared/utils.js';

async function main(): Promise<void> {
  const server = new RuntimeEngineServer();
  await server.start();
}

// Note: process.stderr.write is used intentionally here. This is a fatal
// startup failure where the structured logger may not yet be initialised.
// Direct stderr output is the only safe mechanism at this stage.
main().catch((err) => {
  process.stderr.write(
    `[runtime-engine] Fatal: ${toErrorMessage(err)}\n`
  );
  process.exit(1);
});
