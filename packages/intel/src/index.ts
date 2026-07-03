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
import type { ToolDefinition } from './tools/types.js';
// Lane 7: scaffold tool (§4.1, §6 lane 7). Each lane appends one import line
// here and one entry to TOOLS below — never reorder/reformat lines you did
// not write (carve-out architecture §6 ownership discipline).
import { scaffoldTool } from './tools/scaffold.js';
// Lane 2: compiler-host code intel (§4.1 code_surface / code_safe_delete).
import { codeSurfaceTool } from './tools/code_surface.js';
import { codeSafeDeleteTool } from './tools/code_safe_delete.js';
// Lane 1: search/read trio (§4.1 code_read / code_grep / code_glob).
import { codeReadTool } from './tools/code_read.js';
import { codeGrepTool } from './tools/code_grep.js';
import { codeGlobTool } from './tools/code_glob.js';
// Lane 3: API + DB analyzers (§4.1 api_routes / api_spec / api_validate / db_schema).
import { apiRoutesTool } from './tools/api_routes.js';
import { apiSpecTool } from './tools/api_spec.js';
import { apiValidateTool } from './tools/api_validate.js';
import { dbSchemaTool } from './tools/db_schema.js';
// Lane 4: frontend analyzers (§4.1 component_tree / hook_dependencies / client_boundary / layout_analysis).
import { componentTreeTool } from './tools/component_tree.js';
import { hookDependenciesTool } from './tools/hook_dependencies.js';
import { clientBoundaryTool } from './tools/client_boundary.js';
import { layoutAnalysisTool } from './tools/layout_analysis.js';
// Lane 10: structural_edit (§8 addendum, intel tool 15) — the one preview-gated
// write surface on an otherwise read-only server.
import { structuralEditTool } from './tools/structural_edit.js';

export const SERVER_NAME = 'intel';
// Injected by build.mjs from plugin.json (the single version source);
// falls back in unbundled dev/test runs where no injection happens.
declare const __GV_VERSION__: string | undefined;
export const SERVER_VERSION = typeof __GV_VERSION__ !== 'undefined' ? __GV_VERSION__ : '0.0.0-dev';

/**
 * Every tool this server serves. One module per tool under `src/tools/`; each
 * lane appends its own definition(s) here. The 14-tool intel surface lands
 * across lanes 1-4 and 7 (§4.1).
 */
const TOOLS: ToolDefinition[] = [
  scaffoldTool,
  codeSurfaceTool,
  codeSafeDeleteTool,
  codeReadTool,
  codeGrepTool,
  codeGlobTool,
  apiRoutesTool,
  apiSpecTool,
  apiValidateTool,
  dbSchemaTool,
  componentTreeTool,
  hookDependenciesTool,
  clientBoundaryTool,
  layoutAnalysisTool,
  structuralEditTool,
];

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
    return { tools: TOOLS.map((t) => t.definition) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    onActivity?.();
    const tool = TOOLS.find((t) => t.definition.name === request.params.name);
    if (!tool) {
      return toCallToolResult(
        errorEnvelope(`Unknown tool: ${request.params.name}. Known tools: ${TOOLS.map((t) => t.definition.name).join(', ') || '(none registered yet)'}.`),
      );
    }
    return tool.handler(request.params.arguments ?? {});
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

// Bootstrap only when run as the process entry — never when imported by tests.
if (!process.env.VITEST) {
  void main().catch((err) => {
    console.error(`[${SERVER_NAME}] fatal:`, err);
    process.exit(1);
  });
}
