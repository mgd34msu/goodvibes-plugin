/**
 * Lifecycle Hooks interfaces for Batch Engine
 * @see SPEC-v2 Section 5.1
 */

export interface LifecycleHooks {
  on_intent?: Hook;
  on_plan?: Hook;
  on_prepare?: Hook;
  on_validate_before?: Hook;
  on_execute?: Hook;
  on_validate_after?: Hook;
  on_commit?: Hook;
  on_chain?: Hook;
  before_operation?: OperationHook;
  after_operation?: OperationHook;
  on_operation_error?: ErrorHook;
  on_operation_retry?: RetryHook;
  on_error?: ErrorHook;
  on_rollback?: Hook;
  on_complete?: Hook;
}

export interface Hook {
  handler: string;
  async?: boolean;
  timeout_ms?: number;
}

export interface OperationHook extends Hook {
  filter?: { types?: string[]; ids?: string[]; };
}

export interface ErrorHook extends Hook {
  filter?: { severity?: string[]; types?: string[]; };
}

export interface RetryHook extends Hook {
  max_retries?: number;
}

export type HookPhase = 'intent' | 'plan' | 'prepare' | 'validate_before' | 'execute' | 'validate_after' | 'commit' | 'chain' | 'error' | 'rollback' | 'complete';

export interface HookContext {
  phase: HookPhase;
  batch_id: string;
  operation_id?: string;
  error?: Error;
  result?: unknown;
  read: (path: string) => Promise<string>;
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export interface HookResult {
  status: 'pass' | 'fail' | 'skip';
  message?: string;
  abort?: boolean;
  data?: unknown;
}
