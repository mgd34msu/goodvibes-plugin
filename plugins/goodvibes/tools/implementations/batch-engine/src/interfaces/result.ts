/**
 * Result Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 3.3
 */

export interface ErrorInfo {
  code: string;
  message: string;
  stack?: string;
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  errors?: string[];
}

export interface OperationResult {
  id: string;
  type: string;
  status: 'success' | 'failed' | 'skipped';
  data: any;                     // Operation-specific data
  error?: ErrorInfo;
  duration_ms: number;
  tokens_used: number;
}

export interface PhaseResult {
  status: 'success' | 'partial' | 'failed';
  results: OperationResult[];
  duration_ms: number;
  tokens_used: number;
}

export interface BatchResult {
  // Summary
  summary: {
    status: 'success' | 'partial' | 'failed' | 'rolled_back';
    operations: {
      total: number;
      succeeded: number;
      failed: number;
      skipped: number;
    };
    duration_ms: number;
    tokens_used: number;
  };

  // Phase results
  phases: {
    read?: PhaseResult;
    write?: PhaseResult;
    exec?: PhaseResult;
    query?: PhaseResult;
    state?: PhaseResult;
  };

  // Validation results
  validation: {
    before: ValidationResult;
    after: ValidationResult;
  };

  // Recovery info
  recovery: {
    checkpoint_id?: string;
    rollback_available: boolean;
    rollback_triggered: boolean;
  };

  // Execution graph
  execution_graph: {
    phases: string[];
    parallel_groups: string[][];
    critical_path_ms: number;
  };
}
