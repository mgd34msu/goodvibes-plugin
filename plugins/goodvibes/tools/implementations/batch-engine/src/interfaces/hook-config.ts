/**
 * Hook Configuration interfaces for Batch Engine
 * @see SPEC-v2 Section 5.3-5.4
 */

import type { LifecycleHooks, Hook, OperationHook, ErrorHook } from './lifecycle.js';
import type { BuiltinHookName } from './hooks-builtin.js';

export type HookReference = BuiltinHookName | HookConfigEntry;

export interface HookConfigEntry {
  handler: string;
  filter?: { types?: string[]; ids?: string[]; severity?: string[]; };
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
