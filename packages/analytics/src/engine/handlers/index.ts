/**
 * Handler barrel export and registry for the analytics-engine MCP tools.
 *
 * Each handler follows the uniform convention:
 *   async function handle<Tool>(aggregator, input, goodvibesDir): Promise<HandlerResponse>
 *
 * The goodvibesDir parameter provides handlers with the path needed to access
 * disk resources (HistoricalStore, config persistence, etc.).
 */

// === Imports ===

import { handleDashboard } from './dashboard.js';
import { handleQuery }     from './query.js';
import { handleBudget }    from './budget.js';
import { handleTag }       from './tag.js';
import { handleExport }    from './export.js';
import { handleConfig }    from './config.js';
import { handleSync }      from './sync.js';

// === Re-exports ===

export {
  handleDashboard,
  handleQuery,
  handleBudget,
  handleTag,
  handleExport,
  handleConfig,
  handleSync,
};

// === Shared type ===

import type { HandlerResponse } from './types.js';
export type { HandlerResponse } from './types.js';

// === Types ===

import type { Aggregator } from '../daemon/aggregator.js';

/**
 * Uniform handler signature: every handler accepts the Aggregator,
 * the (already-validated) input, and the goodvibesDir path.
 */
export type HandlerFn = (
  aggregator: Aggregator,
  input: unknown,
  goodvibesDir: string,
) => Promise<HandlerResponse>;

// === Registry ===

/**
 * Maps each MCP tool name to its handler function.
 *
 * All handlers share the uniform (aggregator, input, goodvibesDir) signature.
 * The engine validates and narrows input before dispatching.
 */
export const HANDLER_REGISTRY: Record<string, HandlerFn> = {
  analytics_dashboard: handleDashboard as HandlerFn,
  analytics_query:     handleQuery as HandlerFn,
  analytics_budget:    handleBudget as HandlerFn,
  analytics_tag:       handleTag as HandlerFn,
  analytics_export:    handleExport as HandlerFn,
  analytics_config:    handleConfig as HandlerFn,
  analytics_sync:      handleSync as HandlerFn,
};
