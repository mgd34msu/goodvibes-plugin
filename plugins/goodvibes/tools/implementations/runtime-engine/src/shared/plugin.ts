/**
 * RuntimePlugin Interface — Shared Layer
 *
 * Defines the plugin contract for all L3 domain plugins.
 * Plugins register workflows, triggers, and event handlers with the runtime.
 */

import type { RuntimeEvent } from './events.js';

/** Plugin lifecycle state */
export type PluginState = 'registered' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/** Workflow definition provided by a plugin */
export interface PluginWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  states: string[];
  initial_state: string;
  transitions: Array<{
    from: string;
    to: string;
    event_type: string;
    conditions?: Array<Record<string, unknown>>;
    actions?: Array<Record<string, unknown>>;
  }>;
}

/** Trigger definition provided by a plugin */
export interface PluginTriggerDefinition {
  id: string;
  name: string;
  description: string;
  event_type: string;
  conditions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  enabled?: boolean;
  max_fires?: number;
}

/** Event handler registration provided by a plugin */
export interface PluginEventHandler {
  event_type: string;
  handler: (event: RuntimeEvent) => void | Promise<void>;
  priority?: number;
  filter?: Record<string, unknown>;
}

/** Minimal logger interface exposed to plugins */
export interface PluginLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Runtime services exposed to plugins during registration */
export interface RuntimeServices {
  emit: (event: RuntimeEvent) => void;
  subscribe: (eventType: string, handler: (event: RuntimeEvent) => void | Promise<void>) => () => void;
  getConfig: () => Record<string, unknown>;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown) => void;
  /** Register a trigger with the core trigger registry */
  registerTrigger: (id: string, definition: PluginTriggerDefinition, handler: (event: RuntimeEvent) => unknown | Promise<unknown>) => void;
  /** Unregister a previously registered trigger */
  unregisterTrigger: (id: string) => void;
  /** Get a named logger for the plugin */
  getLogger: (name: string) => PluginLogger;
}

/**
 * RuntimePlugin interface — the contract for all L3 domain plugins.
 * Plugins register workflows, triggers, and event handlers with the runtime.
 */
export interface RuntimePlugin {
  /** Unique plugin identifier */
  readonly name: string;
  /** Semantic version */
  readonly version: string;
  /** Current lifecycle state */
  state: PluginState;

  /** Register plugin with runtime — called once during bootstrap */
  register(services: RuntimeServices): void | Promise<void>;
  /** Start plugin — called after all plugins registered */
  start(): void | Promise<void>;
  /** Stop plugin — called during shutdown */
  stop(): void | Promise<void>;

  /** Workflow definitions this plugin provides */
  getWorkflowDefinitions(): PluginWorkflowDefinition[];
  /** Trigger definitions this plugin provides */
  getTriggerDefinitions(): PluginTriggerDefinition[];
  /** Event handlers this plugin provides */
  getHandlers(): PluginEventHandler[];
}
