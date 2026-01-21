/**
 * Batch Engine - Core Batch Interfaces
 * SPEC-v2 Section 3.1: Batch Definition Interfaces
 */

export interface ValidationStep {
  type: 'typecheck' | 'lint' | 'test' | 'build' | 'custom';
  command?: string;
  required: boolean;
}

export interface OutputConfig {
  mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
  include?: string[];
  exclude?: string[];
  max_tokens?: number;
}

export interface BatchConfig {
  transaction: {
    mode: 'atomic' | 'partial' | 'none';
    checkpoint: boolean;
    rollback_on_error: boolean;
  };
  execution: {
    parallel: boolean;
    max_concurrent: number;
    timeout_ms: number;
    retry: { max_attempts: number; backoff_ms: number };
  };
  preview: {
    enabled: boolean;
    show_diffs: boolean;
    require_approval: boolean;
  };
  validation: {
    before: ValidationStep[];
    after: ValidationStep[];
  };
  recovery: {
    on_error: 'halt' | 'continue' | 'rollback' | 'fix';
    max_fix_attempts: number;
    checkpoint_before: boolean;
  };
}

export interface LifecycleHooks {
  on_intent?: string;
  on_plan?: string;
  on_prepare?: string;
  on_validate_before?: string;
  on_execute?: string;
  on_validate_after?: string;
  on_commit?: string;
  on_chain?: string;
  before_operation?: string;
  after_operation?: string;
  on_operation_error?: string;
  on_operation_retry?: string;
  on_error?: string;
  on_rollback?: string;
  on_complete?: string;
}

export interface Batch {
  id: string;
  parent_id?: string;
  operations: Operation[];
  config: BatchConfig;
  lifecycle?: LifecycleHooks;
  output?: OutputConfig;
}

import type { Operation } from './operation.js';
