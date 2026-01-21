/**
 * Batch Definition interfaces for Batch Engine
 * @see SPEC-v2 Section 3.1
 */

import type { Operation } from './operation.js';

export type ValidationCheck = 'typecheck' | 'lint' | 'test' | 'build' | 'custom';

export interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
  include?: string[];
  exclude?: string[];
  max_tokens?: number;
}

export interface BatchConfig {
  transaction: {
    mode: 'atomic' | 'partial' | 'none';
    checkpoint_before?: boolean;
    rollback_on_error?: boolean;
  };
  execution: {
    parallel?: boolean;
    max_parallel?: number;
    timeout_ms?: number;
    retry?: { max_attempts: number; delay_ms?: number; backoff?: 'linear' | 'exponential'; };
  };
  preview?: {
    enabled: boolean;
    show_diffs?: boolean;
    require_approval?: boolean;
  };
  validation?: {
    before?: ValidationCheck[];
    after?: ValidationCheck[];
  };
  recovery?: {
    on_error: 'halt' | 'rollback' | 'continue' | 'fix';
    max_fix_attempts?: number;
  };
}

export interface LifecycleHooks {
  on_batch_start?: string;
  on_batch_complete?: string;
  on_operation_start?: string;
  on_operation_complete?: string;
  on_error?: string;
  on_rollback?: string;
}

export interface Batch {
  id: string;
  parent_id?: string;
  operations: Operation[];
  config: BatchConfig;
  lifecycle?: LifecycleHooks;
  output?: OutputConfig;
}
