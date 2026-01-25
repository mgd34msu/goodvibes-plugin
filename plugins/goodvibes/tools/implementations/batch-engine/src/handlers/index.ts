/**
 * Handler registry for batch-engine
 * @see SPEC-v2 Section 13
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Handler function type
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

// Import handler implementations
import { handleBatch, getActiveBatch, getCompletedBatch, listActiveBatches, listCompletedBatches } from './batch.js';
import { handleBatchStatus, handleListBatches } from './batch-status.js';
import { handleBatchRecover, handleListCheckpoints } from './batch-recover.js';
import { handleBatchState } from './batch-state.js';

// Re-export handlers for direct access
export {
  handleBatch,
  getActiveBatch,
  getCompletedBatch,
  listActiveBatches,
  listCompletedBatches,
  handleBatchStatus,
  handleListBatches,
  handleBatchRecover,
  handleListCheckpoints,
  handleBatchState,
};

/**
 * Handler registry mapping tool names to handler functions
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  ['batch', handleBatch],
  ['batch_status', handleBatchStatus],
  ['batch_list', handleListBatches],
  ['batch_recover', handleBatchRecover],
  ['batch_checkpoints', handleListCheckpoints],
  ['batch_state', handleBatchState],
]);

/**
 * Get a handler by tool name
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check if a tool is registered
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}

/**
 * Tool definitions for MCP server registration
 */
export const toolDefinitions = [
  {
    name: 'batch',
    description: 'Execute a batch of operations with transaction support, validation, and recovery. The heart of SPEC-v2 orchestration.',
    inputSchema: {
      type: 'object',
      properties: {
        discovery: {
          type: 'object',
          description: 'Optional discovery phase to gather context before operations',
          properties: {
            queries: { type: 'array', items: { type: 'object' } },
            inject_results: { type: 'boolean' },
          },
        },
        operations: {
          type: 'object',
          description: 'Operations grouped by phase: read, write, exec, query, state',
          properties: {
            read: { type: 'array', items: { type: 'object' } },
            write: { type: 'array', items: { type: 'object' } },
            exec: { type: 'array', items: { type: 'object' } },
            query: { type: 'array', items: { type: 'object' } },
            state: { type: 'array', items: { type: 'object' } },
          },
        },
        config: {
          type: 'object',
          description: 'Batch configuration for transaction, execution, preview, validation, and recovery',
        },
        dry_run: { type: 'boolean', description: 'Preview without executing' },
        preview: { type: 'boolean', description: 'DEPRECATED: Use dry_run instead. Alias for dry_run.' },
        timeout_ms: { type: 'number', description: 'Timeout for batch execution' },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Output verbosity level',
        },
      },
    },
  },
  {
    name: 'batch_status',
    description: 'Check the status of a batch execution, including progress, results, and agent status.',
    inputSchema: {
      type: 'object',
      required: ['batch_id'],
      properties: {
        batch_id: { type: 'string', description: 'ID of the batch to check' },
        include: {
          type: 'object',
          description: 'What to include in the response',
          properties: {
            results: { type: 'boolean' },
            telemetry: { type: 'boolean' },
            operations: { type: 'boolean' },
            agents: { type: 'boolean' },
          },
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Output verbosity level',
        },
      },
    },
  },
  {
    name: 'batch_list',
    description: 'List all batches, optionally filtered by status or time range.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['pending', 'running', 'paused', 'completing', 'completed', 'failed', 'rolled_back', 'cancelled'],
          },
          description: 'Filter by status',
        },
        limit: { type: 'number', description: 'Maximum number of batches to return' },
        since: { type: 'string', description: 'ISO timestamp - only batches after this time' },
        until: { type: 'string', description: 'ISO timestamp - only batches before this time' },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Output verbosity level',
        },
      },
    },
  },
  {
    name: 'batch_recover',
    description: 'Recovery operations: rollback, restore, retry, cleanup, or fix failed operations.',
    inputSchema: {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: {
          type: 'string',
          enum: ['rollback', 'restore', 'retry', 'cleanup', 'fix'],
          description: 'The recovery operation to perform',
        },
        rollback: {
          type: 'object',
          description: 'Options for rollback operation',
          properties: {
            batch_id: { type: 'string' },
            checkpoint_id: { type: 'string' },
            scope: { type: 'string', enum: ['all', 'files', 'state', 'selective'] },
            files: { type: 'array', items: { type: 'string' } },
            state_keys: { type: 'array', items: { type: 'string' } },
          },
        },
        restore: {
          type: 'object',
          description: 'Options for restore operation',
          properties: {
            checkpoint_id: { type: 'string' },
            files_only: { type: 'boolean' },
            state_only: { type: 'boolean' },
          },
        },
        retry: {
          type: 'object',
          description: 'Options for retry operation',
          properties: {
            batch_id: { type: 'string' },
            operation_ids: { type: 'array', items: { type: 'string' } },
            max_attempts: { type: 'number' },
          },
        },
        cleanup: {
          type: 'object',
          description: 'Options for cleanup operation',
          properties: {
            older_than_hours: { type: 'number' },
            keep_last: { type: 'number' },
            dry_run: { type: 'boolean' },
          },
        },
        fix: {
          type: 'object',
          description: 'Options for fix operation',
          properties: {
            batch_id: { type: 'string' },
            operation_id: { type: 'string' },
            strategy: { type: 'string', enum: ['auto', 'agent', 'targeted'] },
            max_attempts: { type: 'number' },
          },
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Output verbosity level',
        },
      },
    },
  },
  {
    name: 'batch_checkpoints',
    description: 'List available checkpoints for recovery.',
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Filter by batch ID' },
        limit: { type: 'number', description: 'Maximum number of checkpoints to return' },
        include_expired: { type: 'boolean', description: 'Include expired checkpoints' },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Output verbosity level',
        },
      },
    },
  },
  {
    name: 'batch_state',
    description: 'Manage persistent state and memory: get, set, query, export, import, or clear.',
    inputSchema: {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: {
          type: 'string',
          enum: ['get', 'set', 'query', 'export', 'import', 'clear'],
          description: 'The state operation to perform',
        },
        get: {
          type: 'object',
          description: 'Options for get operation',
          properties: {
            keys: {
              type: 'array',
              items: { type: 'string' },
              description: 'Dot-notation paths to retrieve (e.g., session.mode)',
            },
          },
        },
        set: {
          type: 'object',
          description: 'Options for set operation',
          properties: {
            values: {
              type: 'object',
              description: 'Key-value pairs to set',
            },
            merge: { type: 'boolean', description: 'Merge with existing values (default: true)' },
          },
        },
        query: {
          type: 'object',
          description: 'Options for memory query',
          properties: {
            type: {
              type: 'string',
              enum: ['decisions', 'patterns', 'failures', 'all'],
            },
            filters: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                files: { type: 'array', items: { type: 'string' } },
                since: { type: 'string' },
                limit: { type: 'number' },
                status: { type: 'string' },
              },
            },
          },
        },
        export: {
          type: 'object',
          description: 'Options for export operation',
          properties: {
            format: { type: 'string', enum: ['json', 'markdown'] },
            include: {
              type: 'array',
              items: { type: 'string', enum: ['state', 'memory', 'telemetry'] },
            },
            output_path: { type: 'string', description: 'File path to write (optional)' },
          },
        },
        import: {
          type: 'object',
          description: 'Options for import operation',
          properties: {
            format: { type: 'string', enum: ['json'] },
            source: {
              oneOf: [
                { type: 'string', description: 'File path or JSON string' },
                { type: 'object', description: 'Inline data object' },
              ],
            },
            merge: { type: 'boolean' },
          },
        },
        clear: {
          type: 'object',
          description: 'Options for clear operation',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string', enum: ['state', 'memory', 'telemetry', 'checkpoints'] },
            },
            confirm: { type: 'boolean', description: 'Must be true to confirm clear' },
          },
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Output verbosity level',
        },
      },
    },
  },
];

/**
 * Get all tool definitions for MCP server registration
 */
export function getToolDefinitions(): typeof toolDefinitions {
  return toolDefinitions;
}
