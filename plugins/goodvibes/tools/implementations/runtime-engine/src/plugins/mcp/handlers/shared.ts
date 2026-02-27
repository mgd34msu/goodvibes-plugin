/**
 * Shared result helpers for all runtime-engine tool handlers.
 *
 * These helpers wrap handler outputs in a typed RuntimeResult envelope
 * and encode the result for MCP CallToolResult.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RuntimeResult } from '../../../shared/types.js';

/**
 * Wrap a successful result in a RuntimeResult envelope and encode for MCP.
 *
 * @param data - The typed payload.
 * @param version - Engine version string.
 * @param uptime_ms - Current engine uptime.
 * @param execution_ms - Handler execution time.
 * @returns MCP CallToolResult with JSON-encoded body.
 */
export function toSuccess<T>(
  data: T,
  version: string,
  uptime_ms: number,
  execution_ms: number
): CallToolResult {
  const result: RuntimeResult<T> = {
    success: true,
    data,
    meta: { engine: 'runtime-engine', version, uptime_ms, execution_ms },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: false,
  };
}

/**
 * Wrap an error in a RuntimeResult envelope and encode for MCP.
 *
 * @param error - Human-readable error message.
 * @param version - Engine version string.
 * @param uptime_ms - Current engine uptime.
 * @param execution_ms - Handler execution time.
 * @returns MCP CallToolResult flagged as an error.
 */
export function toError(
  error: string,
  version: string,
  uptime_ms: number,
  execution_ms: number
): CallToolResult {
  const result: RuntimeResult<never> = {
    success: false,
    error,
    meta: { engine: 'runtime-engine', version, uptime_ms, execution_ms },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
}
