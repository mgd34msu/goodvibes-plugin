/**
 * Hook Configuration interfaces for Batch Engine
 * @see SPEC-v2 Section 5.3-5.4
 */

import type { LifecycleHooks, Hook, OperationHook, ErrorHook } from './lifecycle.js';
import type { BuiltinHookName } from './hooks-builtin.js';

/**
 * Filter configuration - supports string shorthand (e.g., "related") or full object
 * @see SPEC-v2 Section 5.3
 */
export type FilterConfig = string | { types?: string[]; ids?: string[]; severity?: string[] };

/**
 * Shorthand hook syntax for inline configuration
 * @example { test: { filter: "related", timeout_ms: 120000 } }
 */
export type HookShorthand = { [K in BuiltinHookName]?: { filter?: FilterConfig; timeout_ms?: number; max_retries?: number } };

/**
 * Hook reference - supports:
 * - String builtin name: "test"
 * - Full config entry: { handler: "test", filter: {...} }
 * - Shorthand object: { test: { filter: "related" } }
 */
export type HookReference = BuiltinHookName | HookConfigEntry | HookShorthand;

export interface HookConfigEntry {
  handler: string;
  filter?: FilterConfig;
  timeout_ms?: number;
  max_retries?: number;
}

export interface LifecycleHooksConfig {
  on_prepare?: HookReference[];
  on_validate_before?: HookReference[];
  on_validate_after?: HookReference[];
  before_operation?: HookReference[];
  after_operation?: HookReference[];
  on_operation_error?: HookReference[];
  on_commit?: HookReference[];
  on_error?: HookReference[];
  on_rollback?: HookReference[];
  on_complete?: HookReference[];
}

export interface HookConfigYAML {
  lifecycle: { hooks: LifecycleHooksConfig; };
}

export interface CustomHookModule {
  [handlerName: string]: (context: import('./lifecycle.js').HookContext) => Promise<import('./lifecycle.js').HookResult>;
}

export interface HookConfigLoader {
  loadFromYAML(yaml: string): LifecycleHooksConfig;
  loadFromObject(config: LifecycleHooksConfig): LifecycleHooks;
  loadCustomHooks(modulePath: string): Promise<CustomHookModule>;
  resolveHookReference(ref: HookReference): Hook | OperationHook | ErrorHook;
}

export interface HookConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateHookConfig(config: LifecycleHooksConfig): HookConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  return { valid: errors.length === 0, errors, warnings };
}
