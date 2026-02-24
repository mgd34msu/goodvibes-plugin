/**
 * Core types for runtime-engine tool handlers.
 *
 * Extracted to a separate module to avoid circular dependencies between
 * tool-handlers.ts (the compat shim) and the per-tool handler modules.
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { HealthStatus } from '../../types.js';
import type { RuntimeConfig } from '../../shared/config.js';
import type { EventBus } from '../../events/event-bus.js';
import type { EventLog } from '../../events/event-log.js';
import type { EventQueue } from '../../events/event-queue.js';
import type { WorkflowEngine } from '../../workflow/workflow-engine.js';
import type { TriggerRegistry } from '../../triggers/trigger-registry.js';
import type { AgentCoordinator } from '../../agents/agent-coordinator.js';
import type { DirectiveQueue } from '../../directives/directive-queue.js';

/**
 * A runtime-engine tool handler.
 * Receives raw MCP tool arguments and returns an MCP CallToolResult.
 */
export type ToolHandler = (args: unknown, context: HandlerContext) => Promise<CallToolResult>;

/**
 * Shared context injected into every tool handler call.
 * Provides access to engine-level services without global state.
 */
export interface HandlerContext {
  /** Milliseconds since engine startup. */
  getUptime: () => number;
  /** Current runtime configuration snapshot. */
  getConfig: () => RuntimeConfig;
  /** Current health status snapshot. */
  getHealth: () => HealthStatus;
  /** Update the in-memory runtime configuration after a disk write. */
  updateConfig: (config: RuntimeConfig) => void;
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Engine version string. */
  version: string;
  /** The runtime event bus (in-memory pub/sub). */
  getEventBus: () => EventBus;
  /** The persistent JSONL event log. */
  getEventLog: () => EventLog;
  /** The priority event queue. */
  getEventQueue: () => EventQueue;
  /** The workflow engine (may be null if workflows_enabled is false). */
  getWorkflowEngine: () => WorkflowEngine | null;
  /** The trigger registry. */
  getTriggerRegistry: () => TriggerRegistry | null;
  /** The agent coordinator (may be null if agents_enabled is false). */
  getAgentCoordinator: () => AgentCoordinator | null;
  /** The directive queue (may be null if not yet initialised). */
  getDirectiveQueue: () => DirectiveQueue | null;
}
