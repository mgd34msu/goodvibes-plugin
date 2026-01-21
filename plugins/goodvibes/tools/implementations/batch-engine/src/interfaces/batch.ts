/**
 * Batch Definition interfaces for Batch Engine
 * @see SPEC-v2 Section 3.1
 */

import type { ReadOperation } from './operations/read.js';
import type { WriteOperation } from './operations/write.js';
import type { ExecOperation, QueryOperation, StateOperation } from './operations/exec.js';
import type { LifecycleHooks } from './lifecycle.js';

// LifecycleConfig is an alias for LifecycleHooks per SPEC-v2 Section 3.1/5.1
export type LifecycleConfig = LifecycleHooks;

export type ValidationStep = 'typecheck' | 'lint' | 'test' | 'build' | 'custom';

export interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
  include: string[];
  exclude: string[];
  max_tokens?: number;
}

export interface BatchConfig {
  // Transaction control
  transaction: {
    mode: 'atomic' | 'partial' | 'none';
    isolation: 'strict' | 'relaxed';
    timeout_ms: number;
  };

  // Execution control
  execution: {
    mode: 'parallel' | 'sequential' | 'adaptive';
    max_workers: number;
    fail_fast: boolean;
    retry: {
      attempts: number;
      backoff: 'linear' | 'exponential' | 'fixed';
      delay_ms: number;
    };
  };

  // Preview & validation
  preview: {
    dry_run: boolean;
    diff: boolean;
    impact: boolean;
  };

  validation: {
    before: ValidationStep[];
    after: ValidationStep[];
    on_fail: 'rollback' | 'warn' | 'ignore';
  };

  // Recovery
  recovery: {
    checkpoint: boolean;
    rollback_on_fail: boolean;
    cleanup_on_success: boolean;
  };
}

export interface Batch {
  // Identity
  id: string;
  parent_id?: string;

  // Operations (categorized)
  operations: {
    read?: ReadOperation[];
    write?: WriteOperation[];
    exec?: ExecOperation[];
    query?: QueryOperation[];
    state?: StateOperation[];
  };

  // Configuration
  config: BatchConfig;

  // Lifecycle
  lifecycle: LifecycleConfig;

  // Output
  output: OutputConfig;
}
