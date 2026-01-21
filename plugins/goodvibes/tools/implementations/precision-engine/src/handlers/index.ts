/**
 * Handler registry for precision-engine.
 */

import { ToolHandler } from '../utils/index.js';

// Import real handler implementations
import { handleBatchRead } from './batch-read.js';
import { handleSmartGlob } from './smart-glob.js';
import { handleGrepWithContent } from './grep-with-content.js';
import { handleAtomicMultiEdit } from './atomic-multi-edit.js';
import { handleWorkspaceSymbols } from './workspace-symbols.js';
import { handleGetDocumentSymbols } from './document-symbols.js';
import { handlePrecisionWrite } from './precision-write.js';
import { handlePrecisionExec } from './precision-exec.js';
import { handlePrecisionFetch } from './precision-fetch.js';
import { handleDiscover } from './discover.js';
import { handlePrecisionGrep } from './precision-grep.js';
import { handlePrecisionRead } from './precision-read.js';
import { handlePrecisionGlob } from './precision-glob.js';
import { handlePrecisionSymbols } from './precision-symbols.js';
import { handlePrecisionEdit } from './precision-edit.js';

// Re-export handlers for direct access
export {
  handleBatchRead,
  handleSmartGlob,
  handleGrepWithContent,
  handleAtomicMultiEdit,
  handleWorkspaceSymbols,
  handleGetDocumentSymbols,
  handlePrecisionWrite,
  handlePrecisionExec,
  handlePrecisionFetch,
  handleDiscover,
  handlePrecisionGrep,
  handlePrecisionRead,
  handlePrecisionGlob,
  handlePrecisionSymbols,
  handlePrecisionEdit,
};

// Re-export ToolHandler type
export type { ToolHandler };

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
  ['precision_write', handlePrecisionWrite],
  ['precision_exec', handlePrecisionExec],
  ['precision_fetch', handlePrecisionFetch],
  ['discover', handleDiscover],
  ['precision_grep', handlePrecisionGrep],
  ['precision_read', handlePrecisionRead],
  ['precision_glob', handlePrecisionGlob],
  ['precision_symbols', handlePrecisionSymbols],
  ['precision_edit', handlePrecisionEdit],
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
