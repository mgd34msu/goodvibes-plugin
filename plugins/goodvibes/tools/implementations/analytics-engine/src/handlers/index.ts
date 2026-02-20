/**
 * Handler barrel export and registry for the analytics-engine MCP tools.
 *
 * Each handler follows the convention:
 *   async function handle<Tool>(aggregator, input, ...extras): Promise<HandlerResponse>
 *
 * The HANDLER_REGISTRY maps MCP tool names to their handler functions.
 * Callers are responsible for passing any extra dependencies required by each handler
 * (e.g. HistoricalStore for analytics_export, config + goodvibesDir for analytics_config).
 */

// === Imports ===

import { handleDashboard }                                  from './dashboard.js';
import { handleQuery }                                      from './query.js';
import { handleBudget }                                     from './budget.js';
import { handleTag, getCurrentTag, getCurrentName, clearTagState } from './tag.js';
import { handleExport }                                     from './export.js';
import { handleConfig }                                     from './config.js';

// === Re-exports ===

export {
  handleDashboard,
  handleQuery,
  handleBudget,
  handleTag,
  getCurrentTag,
  getCurrentName,
  clearTagState,
  handleExport,
  handleConfig,
};

// === Shared type ===

export type { HandlerResponse } from './types.js';

// === Registry ===

/**
 * Maps each MCP tool name to its handler function.
 *
 * Note: handlers have different signatures depending on their dependencies.
 * This registry uses a union type; the engine layer is responsible for
 * invoking each handler with the correct arguments.
 */
export const HANDLER_REGISTRY = {
  analytics_dashboard: handleDashboard,
  analytics_query:     handleQuery,
  analytics_budget:    handleBudget,
  analytics_tag:       handleTag,
  analytics_export:    handleExport,
  analytics_config:    handleConfig,
} as const;
