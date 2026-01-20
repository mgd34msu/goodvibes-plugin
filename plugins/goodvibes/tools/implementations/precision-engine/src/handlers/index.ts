/**
 * Handler registry for precision-engine.
 */

import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { logger, startTimer } from '../logging.js';
import { parseOutputMode } from '../utils/index.js';
import { PrecisionResult } from '../types.js';

/**
 * Handler function type.
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/**
 * Convert a PrecisionResult to MCP CallToolResult format.
 */
export function toCallToolResult<T>(result: PrecisionResult<T>): CallToolResult {
  const content: TextContent = {
    type: 'text',
    text: JSON.stringify(result, null, 2),
  };

  return {
    content: [content],
    isError: !result.success,
  };
}

/**
 * Create a "not implemented" placeholder handler.
 */
function notImplementedHandler(toolName: string): ToolHandler {
  return async (args: unknown): Promise<CallToolResult> => {
    const outputMode = parseOutputMode(args);
    const getElapsed = startTimer();

    logger.warn(`Tool not implemented: ${toolName}`, args);

    const result: PrecisionResult<null> = {
      success: false,
      error: `Tool '${toolName}' is not yet implemented.`,
      meta: {
        output_mode: outputMode,
        token_estimate: 50,
        execution_ms: getElapsed(),
      },
    };

    return toCallToolResult(result);
  };
}

// Placeholder handlers - will be replaced with real implementations
export const handleBatchRead: ToolHandler = notImplementedHandler('batch_read');
export const handleSmartGlob: ToolHandler = notImplementedHandler('smart_glob');
export const handleGrepWithContent: ToolHandler = notImplementedHandler('grep_with_content');
export const handleAtomicMultiEdit: ToolHandler = notImplementedHandler('atomic_multi_edit');
export const handleWorkspaceSymbols: ToolHandler = notImplementedHandler('workspace_symbols');
export const handleGetDocumentSymbols: ToolHandler = notImplementedHandler('get_document_symbols');

/**
 * Handler registry.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  ['batch_read', handleBatchRead],
  ['smart_glob', handleSmartGlob],
  ['grep_with_content', handleGrepWithContent],
  ['atomic_multi_edit', handleAtomicMultiEdit],
  ['workspace_symbols', handleWorkspaceSymbols],
  ['get_document_symbols', handleGetDocumentSymbols],
]);

/**
 * Get a handler by tool name.
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check if a tool is registered.
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names.
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}
