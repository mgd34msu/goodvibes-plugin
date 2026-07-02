/**
 * connect tool registry — the three tools and their dispatch map.
 *
 * `TOOLS` is the ListTools payload (schemas are deferred by the client);
 * `HANDLERS` maps a tool name to its handler. `src/index.ts` consumes both, so
 * adding a tool is a one-line change here.
 */

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { apiRequestTool, handleApiRequest } from './api-request.js';
import { serviceTool, handleService } from './service.js';
import { dbQueryTool, handleDbQuery } from './db-query.js';

/** The tools this server exposes (order is the surfaced order). */
export const TOOLS: Tool[] = [
  apiRequestTool as unknown as Tool,
  serviceTool as unknown as Tool,
  dbQueryTool as unknown as Tool,
];

/** name → handler dispatch. */
export const HANDLERS: Record<string, (args: unknown) => Promise<CallToolResult>> = {
  [apiRequestTool.name]: handleApiRequest,
  [serviceTool.name]: handleService,
  [dbQueryTool.name]: handleDbQuery,
};
