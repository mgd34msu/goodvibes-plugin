/**
 * Built-in Hooks for Batch Engine
 * @see SPEC-v2 Section 5.2
 */

import type { HookPhase } from './lifecycle.js';

export interface BuiltinHookDefinition {
  phase: HookPhase;
  handler: string;
  description: string;
}

export const BUILTIN_HOOKS: Record<string, BuiltinHookDefinition> = {
  checkpoint: { phase: 'prepare', handler: 'createCheckpoint', description: 'Create restore point before execution' },
  acquire_locks: { phase: 'prepare', handler: 'acquireResourceLocks', description: 'Lock files/resources for exclusive access' },
  inject_context: { phase: 'prepare', handler: 'injectRelevantContext', description: 'Load relevant memory, patterns, decisions' },
  typecheck: { phase: 'validate_before', handler: 'runTypeCheck', description: 'Run TypeScript type checking' },
  lint: { phase: 'validate_before', handler: 'runLinter', description: 'Run ESLint/Prettier' },
  test: { phase: 'validate_before', handler: 'runTests', description: 'Run test suite' },
  build: { phase: 'validate_before', handler: 'runBuild', description: 'Run build process' },
  update_state: { phase: 'commit', handler: 'updateSessionState', description: 'Update session state with results' },
  record_memory: { phase: 'commit', handler: 'recordToMemory', description: 'Record decisions, patterns, failures' },
  emit_telemetry: { phase: 'commit', handler: 'emitTelemetry', description: 'Record metrics and audit trail' },
  release_locks: { phase: 'commit', handler: 'releaseResourceLocks', description: 'Release acquired locks' },
  rollback: { phase: 'error', handler: 'rollbackToCheckpoint', description: 'Restore from checkpoint on failure' },
  fix_loop: { phase: 'error', handler: 'runFixLoop', description: 'Attempt automatic fixes' }
};

export type BuiltinHookName = keyof typeof BUILTIN_HOOKS;

export interface HookHandler {
  (context: import('./lifecycle.js').HookContext): Promise<import('./lifecycle.js').HookResult>;
}

export interface HookRegistry {
  builtin: Record<string, HookHandler>;
  custom: Record<string, HookHandler>;
  register(name: string, handler: HookHandler): void;
  get(name: string): HookHandler | undefined;
  list(): string[];
}
