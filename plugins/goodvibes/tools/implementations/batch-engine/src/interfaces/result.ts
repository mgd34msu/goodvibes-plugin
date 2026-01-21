/**
 * Result Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 3.3
 */

export interface ValidationResult {
  check: string;
  passed: boolean;
  errors?: string[];
}

export interface OperationResult {
  id: string;
  type: string;
  status: 'success' | 'failed' | 'skipped';
  data?: unknown;
  error?: { code: string; message: string; stack?: string; };
  duration_ms: number;
  tokens_used: number;
}

export interface PhaseResult {
  phase: number;
  status: 'success' | 'partial' | 'failed';
  results: OperationResult[];
  duration_ms: number;
  tokens_used: number;
}

export interface BatchResult {
  id: string;
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  summary: {
    total_operations: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  phases: PhaseResult[];
  validation?: { before: ValidationResult[]; after: ValidationResult[]; };
  recovery?: { checkpoints_created: number; rollbacks_performed: number; fixes_attempted: number; };
  execution_graph?: { phases: string[][]; critical_path: string[]; };
  duration_ms: number;
  tokens_used: number;
}
