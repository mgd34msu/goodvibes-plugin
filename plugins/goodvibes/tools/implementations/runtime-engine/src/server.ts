/**
 * Runtime Engine — Server Entry Point
 *
 * This is the executable entry point for the runtime-engine MCP server.
 * It instantiates RuntimeEngineServer and starts it.
 *
 * The library surface (config, types, utilities, persistence) is exported
 * separately from src/index.ts for use by other engine subsystems.
 */

import { RuntimeEngineServer } from './server/mcp-server.js';
import { toErrorMessage } from './shared/utils.js';

async function main(): Promise<void> {
  const server = new RuntimeEngineServer();
  await server.start();
}

main().catch((err) => {
  process.stderr.write(
    `[runtime-engine] Fatal: ${toErrorMessage(err)}\n`
  );
  process.exit(1);
});
