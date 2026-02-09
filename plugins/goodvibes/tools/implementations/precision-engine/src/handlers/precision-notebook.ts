/**
 * precision_notebook handler - Edit Jupyter notebook cells with batch operations
 * 
 * Features:
 * - Replace: Modify cell content at specific index
 * - Insert: Add new cells at specified positions
 * - Delete: Remove cells at specified indices
 * - Batch operations with index adjustment
 * - OCC integration with FileStateCache
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { FileStateCache } from '../state/file-cache.js';

/**
 * Notebook cell structure
 */
interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: unknown[];
  id?: string; // nbformat 4.5+ cell ID
}

/**
 * Jupyter notebook structure
 */
interface JupyterNotebook {
  nbformat: number;
  nbformat_minor: number;
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
}

/**
 * Single notebook operation
 */
interface NotebookOperation {
  op: 'replace' | 'insert' | 'delete';
  cell?: number;       // 0-indexed cell index (required for replace/delete)
  cell_id?: string;    // Cell ID (alternative to index-based targeting)
  after?: number;      // 0-indexed position for insert (insert after this index, -1 for beginning)
  source?: string;     // Cell content (required for replace/insert)
  cell_type?: 'code' | 'markdown' | 'raw'; // Cell type (required for replace/insert)
  clear_outputs?: boolean; // For replace: clear outputs (default false)
}

/**
 * Input schema
 */
interface PrecisionNotebookInput {
  path: string;
  operations: NotebookOperation[];
  output_mode?: OutputMode;
}

/**
 * Operation summary
 */
interface OperationSummary {
  op: string;
  cell?: number;
  cell_id?: string;
  after?: number;
  cell_type?: string;
}

/**
 * Output result
 */
interface NotebookResult {
  status: 'applied' | 'error';
  path: string;
  operations_applied: number;
  cells_before: number;
  cells_after: number;
  summary: OperationSummary[];
  error?: string;
}

/**
 * Normalize source to string array (notebooks use string arrays for multi-line)
 */
function normalizeSource(source: string | string[]): string[] {
  if (Array.isArray(source)) {
    return source;
  }
  // Split by lines and preserve newlines
  const lines = source.split('\n');
  return lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line));
}

/**
 * Validate notebook structure
 */
function validateNotebook(notebook: unknown): notebook is JupyterNotebook {
  if (!notebook || typeof notebook !== 'object') {
    return false;
  }
  
  const nb = notebook as Partial<JupyterNotebook>;
  
  if (typeof nb.nbformat !== 'number') {
    return false;
  }
  
  if (!Array.isArray(nb.cells)) {
    return false;
  }
  
  return true;
}

/**
 * Resolve cell_id to cell index. Checks cell.id first, then cell.metadata.id.
 * Returns -1 if not found.
 */
function resolveCellId(cells: NotebookCell[], cellId: string): number {
  const id = String(cellId); // Type safety coercion
  return cells.findIndex(cell => 
    cell.id === id || (cell.metadata && (cell.metadata as Record<string, unknown>).id === id)
  );
}

/**
 * Generate a unique random 8-character alphanumeric cell ID (nbformat 4.5 spec).
 * Checks existing cells to avoid collisions.
 */
function generateCellId(existingCells?: NotebookCell[]): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const existing = existingCells 
    ? new Set(existingCells.map(c => c.id).filter(Boolean))
    : new Set<string>();
  let id: string;
  do {
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (existing.has(id));
  return id;
}

/**
 * Apply operations to notebook with index adjustment
 */
function applyOperations(
  notebook: JupyterNotebook,
  operations: NotebookOperation[]
): { success: boolean; applied: number; summary: OperationSummary[]; error?: string } {
  const summary: OperationSummary[] = [];
  let applied = 0;
  
  // Track index adjustments as we apply operations
  let indexOffset = 0;
  
  for (const op of operations) {
    try {
      switch (op.op) {
        case 'replace': {
          if (op.cell === undefined && op.cell_id === undefined) {
            return {
              success: false,
              applied,
              summary,
              error: 'replace operation requires "cell" index or "cell_id"'
            };
          }
          
          if (op.source === undefined) {
            return {
              success: false,
              applied,
              summary,
              error: 'replace operation requires "source"'
            };
          }
          
          // Resolve cell index (cell_id takes precedence)
          let targetIndex: number;
          if (op.cell_id !== undefined) {
            const resolved = resolveCellId(notebook.cells, op.cell_id);
            if (resolved === -1) {
              return {
                success: false,
                applied,
                summary,
                error: `replace: cell_id "${op.cell_id}" not found in notebook`
              };
            }
            targetIndex = resolved;
          } else {
            targetIndex = op.cell! + indexOffset;
          }
          
          if (targetIndex < 0 || targetIndex >= notebook.cells.length) {
            return {
              success: false,
              applied,
              summary,
              error: `replace: cell index ${op.cell} (adjusted to ${targetIndex}) out of bounds (0-${notebook.cells.length - 1})`
            };
          }
          
          const cell = notebook.cells[targetIndex];
          cell.source = normalizeSource(op.source);
          
          if (op.cell_type) {
            cell.cell_type = op.cell_type;
            // Ensure code cells have required nbformat v4 fields
            if (op.cell_type === 'code') {
              if (cell.execution_count === undefined) cell.execution_count = null;
              if (cell.outputs === undefined) cell.outputs = [];
            }
            // Clean non-applicable fields when converting away from code
            if (op.cell_type !== 'code') {
              delete cell.execution_count;
              delete cell.outputs;
            }
          }
          
          if (op.clear_outputs && cell.cell_type === 'code') {
            cell.outputs = [];
            cell.execution_count = null;
          }
          
          summary.push({
            op: 'replace',
            cell: op.cell,
            cell_id: op.cell_id,
            cell_type: cell.cell_type
          });
          applied++;
          break;
        }
        
        case 'insert': {
          if (op.source === undefined) {
            return {
              success: false,
              applied,
              summary,
              error: 'insert operation requires "source"'
            };
          }
          
          if (!op.cell_type) {
            return {
              success: false,
              applied,
              summary,
              error: 'insert operation requires "cell_type"'
            };
          }
          
          const newCell: NotebookCell = {
            cell_type: op.cell_type,
            source: normalizeSource(op.source),
            metadata: {}
          };
          
          if (op.cell_type === 'code') {
            newCell.execution_count = null;
            newCell.outputs = [];
          }
          
          // Generate cell ID for nbformat 4.5+ notebooks
          if (notebook.nbformat > 4 || (notebook.nbformat === 4 && notebook.nbformat_minor >= 5)) {
            newCell.id = generateCellId(notebook.cells);
          }
          
          let insertIndex: number;
          
          // Resolve insert position (cell_id takes precedence)
          if (op.cell_id !== undefined) {
            const resolved = resolveCellId(notebook.cells, op.cell_id);
            if (resolved === -1) {
              return {
                success: false,
                applied,
                summary,
                error: `insert: cell_id "${op.cell_id}" not found in notebook`
              };
            }
            insertIndex = resolved + 1; // Insert after the found cell
          } else if (op.after !== undefined) {
            // Insert after specified index (after === -1 means beginning)
            const adjustedAfter = op.after + indexOffset;
            if (adjustedAfter < -1 || adjustedAfter >= notebook.cells.length) {
              return {
                success: false,
                applied,
                summary,
                error: `insert: after index ${op.after} out of bounds (-1 to ${notebook.cells.length - 1})`
              };
            }
            insertIndex = adjustedAfter + 1; // -1 + 1 = 0 (beginning), N + 1 = after N
          } else {
            // Append at end
            insertIndex = notebook.cells.length;
          }
          
          notebook.cells.splice(insertIndex, 0, newCell);
          indexOffset++; // Adjust for inserted cell
          
          summary.push({
            op: 'insert',
            after: op.after,
            cell_id: op.cell_id,
            cell_type: op.cell_type
          });
          applied++;
          break;
        }
        
        case 'delete': {
          if (op.cell === undefined && op.cell_id === undefined) {
            return {
              success: false,
              applied,
              summary,
              error: 'delete operation requires "cell" index or "cell_id"'
            };
          }
          
          // Resolve cell index (cell_id takes precedence)
          let targetIndex: number;
          if (op.cell_id !== undefined) {
            const resolved = resolveCellId(notebook.cells, op.cell_id);
            if (resolved === -1) {
              return {
                success: false,
                applied,
                summary,
                error: `delete: cell_id "${op.cell_id}" not found in notebook`
              };
            }
            targetIndex = resolved;
          } else {
            targetIndex = op.cell! + indexOffset;
          }
          
          if (targetIndex < 0 || targetIndex >= notebook.cells.length) {
            return {
              success: false,
              applied,
              summary,
              error: `delete: cell index ${op.cell} (adjusted to ${targetIndex}) out of bounds (0-${notebook.cells.length - 1})`
            };
          }
          
          notebook.cells.splice(targetIndex, 1);
          indexOffset--; // Adjust for deleted cell
          
          summary.push({
            op: 'delete',
            cell: op.cell,
            cell_id: op.cell_id
          });
          applied++;
          break;
        }
        
        default: {
          return {
            success: false,
            applied,
            summary,
            error: `Unknown operation: ${(op as NotebookOperation).op}`
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        applied,
        summary,
        error: `Error applying operation: ${(error as Error).message}`
      };
    }
  }
  
  return {
    success: true,
    applied,
    summary
  };
}

export const handlePrecisionNotebook: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionNotebookInput;
  const outputMode = parseOutputMode(args, 'precision_notebook');
  const workDir = process.cwd();
  
  try {
    // Validate input
    if (!input.path) {
      return toCallToolResult(
        createErrorResult(
          formatMissingParamError('precision_notebook', 'path', 'string'),
          { output_mode: outputMode, execution_ms: getElapsed() }
        )
      );
    }
    
    if (!input.operations || !Array.isArray(input.operations)) {
      return toCallToolResult(
        createErrorResult(
          formatMissingParamError('precision_notebook', 'operations', 'array'),
          { output_mode: outputMode, execution_ms: getElapsed() }
        )
      );
    }
    
    // Resolve absolute path
    const filePath = path.isAbsolute(input.path)
      ? input.path
      : path.join(workDir, input.path);
    
    // Check file extension
    if (!filePath.endsWith('.ipynb')) {
      return toCallToolResult(
        errorResult(
          `File must have .ipynb extension: ${input.path}`,
          outputMode,
          getElapsed()
        )
      );
    }
    
    // Read file
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return toCallToolResult(
        errorResult(
          `Failed to read file: ${(error as Error).message}`,
          outputMode,
          getElapsed()
        )
      );
    }
    
    // Parse notebook JSON
    let notebook: JupyterNotebook;
    try {
      const parsed = JSON.parse(fileContent);
      if (!validateNotebook(parsed)) {
        return toCallToolResult(
          errorResult(
            'Invalid notebook structure: missing nbformat or cells array',
            outputMode,
            getElapsed()
          )
        );
      }
      notebook = parsed;
    } catch (error) {
      return toCallToolResult(
        errorResult(
          `Failed to parse notebook JSON: ${(error as Error).message}`,
          outputMode,
          getElapsed()
        )
      );
    }
    
    const cellsBefore = notebook.cells.length;
    
    // Empty operations array - return success with 0 operations
    if (input.operations.length === 0) {
      const result: NotebookResult = {
        status: 'applied',
        path: input.path,
        operations_applied: 0,
        cells_before: cellsBefore,
        cells_after: cellsBefore,
        summary: []
      };
      
      return toCallToolResult(successResult(result, outputMode, getElapsed()));
    }
    
    // Apply operations
    const applyResult = applyOperations(notebook, input.operations);
    
    if (!applyResult.success) {
      const result: NotebookResult = {
        status: 'error',
        path: input.path,
        operations_applied: applyResult.applied,
        cells_before: cellsBefore,
        cells_after: notebook.cells.length,
        summary: applyResult.summary,
        error: applyResult.error
      };
      
      return toCallToolResult(errorResult(applyResult.error || 'Operation failed', outputMode, getElapsed()));
    }
    
    // Serialize notebook with 1-space indent
    const newContent = JSON.stringify(notebook, null, 1) + '\n';
    
    // Write file
    try {
      await fs.writeFile(filePath, newContent, 'utf-8');
    } catch (error) {
      return toCallToolResult(
        errorResult(
          `Failed to write file: ${(error as Error).message}`,
          outputMode,
          getElapsed()
        )
      );
    }
    
    // Invalidate FileStateCache so next read returns fresh content
    try {
      const cache = FileStateCache.getInstance();
      cache.invalidate(filePath);
    } catch {
      // Cache invalidation is non-critical
    }
    
    const result: NotebookResult = {
      status: 'applied',
      path: input.path,
      operations_applied: applyResult.applied,
      cells_before: cellsBefore,
      cells_after: notebook.cells.length,
      summary: applyResult.summary
    };
    
    return toCallToolResult(successResult(result, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(
      errorResult((error as Error).message, outputMode, getElapsed())
    );
  }
};
