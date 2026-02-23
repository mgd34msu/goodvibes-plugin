/**
 * Handler registry for the runtime-engine MCP server.
 *
 * Re-exports all per-tool handlers and provides the registry Map
 * plus helper functions for clean handler lookup.
 *
 * Also re-exports allSchemas (tool input schema definitions) for use
 * by the MCP server's ListTools handler.
 */

export type { ToolHandler, HandlerContext } from './types.js';
import type { ToolHandler } from './types.js';

export { toSuccess, toError } from './shared.js';
export { handleRuntimeStatus } from './status.js';
export { handleRuntimeConfig, VALID_CONFIG_KEYS, CONFIG_KEY_TYPES } from './config.js';
export {
  handleRuntimeEvents,
  matchesTypePattern,
  resolveTimestamp,
  applyVerbosity,
} from './events.js';
export { handleRuntimeEmit } from './emit.js';
export { handleRuntimeWorkflow } from './workflow.js';
export {
  handleRuntimeTriggers,
  VALID_TRIGGER_ACTION_TYPES,
  validateTriggerDefinition,
} from './triggers.js';
export { handleRuntimeAgents } from './agents.js';

import { handleRuntimeStatus } from './status.js';
import { handleRuntimeConfig } from './config.js';
import { handleRuntimeEvents } from './events.js';
import { handleRuntimeEmit } from './emit.js';
import { handleRuntimeWorkflow } from './workflow.js';
import { handleRuntimeTriggers } from './triggers.js';
import { handleRuntimeAgents } from './agents.js';

// ─── Tool schemas ─────────────────────────────────────────────────────────────

/**
 * MCP tool schema definitions for all runtime-engine tools (Phase 1-5).
 * Returned verbatim in response to ListToolsRequestSchema.
 */
export const allSchemas = [
  {
    name: 'runtime_status',
    description:
      'Get the current health, uptime, and operational status of the runtime engine. ' +
      'Returns process metrics, feature flags, and individual health check results.',
    inputSchema: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['workflows', 'agents', 'queue', 'triggers', 'budget', 'health'],
          },
          description:
            'Subsystems to include in the response. Omit to return all available data.',
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Response verbosity level.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_config',
    description:
      'Read or modify runtime-engine configuration. ' +
      'Use get to read (full config or a single dot-separated key), ' +
      'set to persist a single key-value pair, ' +
      'or reset to restore factory defaults.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'reset'],
          description: 'Operation to perform.',
        },
        key: {
          type: 'string',
          description:
            'Dot-separated configuration key (e.g. "server.log_level"). ' +
            'Required for set; optional for get (returns full config if omitted).',
        },
        value: {
          description:
            'Value to assign. Required for set. Accepts any JSON-serialisable value.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_events',
    description:
      'Query the runtime event log: filter by type, source, time range. ' +
      'Inspect event history and queue statistics.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['query', 'tail', 'stats'],
          description:
            'query: filter event log (persistent), ' +
            'tail: recent events from in-memory bus history, ' +
            'stats: log and queue statistics.',
        },
        filter: {
          type: 'object',
          properties: {
            types: {
              type: 'array',
              items: { type: 'string' },
              description: "Event type patterns to filter (supports glob: 'hook:*', '*').",
            },
            source_kind: {
              type: 'string',
              description: 'Filter by event source kind (e.g. hook, agent, system).',
            },
            since: {
              type: 'string',
              description: "Start time (ISO timestamp or relative: '5m', '1h', '30s').",
            },
            until: {
              type: 'string',
              description: 'End time (ISO timestamp).',
            },
            correlation_id: {
              type: 'string',
              description: 'Filter by correlation ID.',
            },
            limit: {
              type: 'number',
              default: 50,
              description: 'Maximum number of events to return.',
            },
          },
          additionalProperties: false,
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Response verbosity level.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_emit',
    description:
      'Emit a custom event into the runtime event bus. ' +
      'Useful for manual workflow advancement, trigger testing, or custom automation.',
    inputSchema: {
      type: 'object',
      required: ['event_type'],
      properties: {
        event_type: {
          type: 'string',
          description: "Event type to emit (e.g. 'system:health_check', 'trigger:fired').",
        },
        payload: {
          type: 'object',
          description: 'Event payload data.',
        },
        correlation_id: {
          type: 'string',
          description: 'Link to a related event chain.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_workflow',
    description:
      'Manage WRFC and fix-loop workflows: create, query, advance state, cancel. ' +
      'Formal state machines for orchestration.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'list', 'advance', 'cancel', 'history'],
        },
        workflow_type: {
          type: 'string',
          enum: ['wrfc_loop', 'fix_loop', 'custom'],
          description: 'Workflow definition to instantiate (for create)',
        },
        workflow_id: { type: 'string' },
        event: {
          type: 'string',
          description: 'Event type to send (for advance)',
        },
        context: {
          type: 'object',
          description: 'Context data (for create/advance)',
        },
        reason: {
          type: 'string',
          description: 'Cancellation reason (for cancel)',
        },
        filter: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'completed', 'failed', 'cancelled', 'timed_out'],
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_triggers',
    description:
      'Manage event triggers: list, create, enable/disable, test conditions. ' +
      'Declarative event-driven automation.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update', 'delete', 'enable', 'disable', 'test'],
        },
        trigger_id: { type: 'string' },
        trigger: {
          type: 'object',
          description: 'TriggerDefinition for create/update',
        },
        test_event: {
          type: 'object',
          description: 'Mock event to test conditions against',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_agents',
    description:
      'Manage coordinated agents: spawn with workflow context, track WRFC chains, ' +
      'monitor budgets, view execution plans. Workflow-aware agent orchestration.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'list', 'get', 'spawn', 'cancel', 'budget', 'plan'],
        },
        agent_id: { type: 'string' },
        workflow_id: { type: 'string' },
        filter: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
            },
            type: { type: 'string' },
            workflow_id: { type: 'string' },
          },
        },
        spawn: {
          type: 'object',
          required: ['type', 'task'],
          properties: {
            type: { type: 'string' },
            task: { type: 'string' },
            budget: { type: 'number' },
            priority: { type: 'number' },
            depends_on: { type: 'array', items: { type: 'string' } },
            workflow_id: { type: 'string' },
            wrfc_phase: {
              type: 'string',
              enum: ['gather', 'plan', 'write', 'review', 'fix'],
            },
          },
        },
        reason: {
          type: 'string',
          description: 'Cancellation reason',
        },
      },
      additionalProperties: false,
    },
  },
] as const;

// ─── Handler registry ─────────────────────────────────────────────────────────

/**
 * Central registry mapping tool names to handler functions.
 * Mirrors the pattern used by precision-engine's handlerRegistry.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  ['runtime_status', handleRuntimeStatus],
  ['runtime_config', handleRuntimeConfig],
  ['runtime_events', handleRuntimeEvents],
  ['runtime_emit', handleRuntimeEmit],
  ['runtime_workflow', handleRuntimeWorkflow],
  ['runtime_triggers', handleRuntimeTriggers],
  ['runtime_agents', handleRuntimeAgents],
]);

/**
 * Retrieve a registered handler by tool name.
 *
 * @param toolName - The MCP tool name.
 * @returns The handler function, or undefined if not registered.
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check whether a tool is registered.
 *
 * @param toolName - The MCP tool name.
 * @returns True if a handler is registered for the given name.
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names.
 *
 * @returns Array of tool name strings.
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}
