/**
 * Shared types for the runtime domain.
 *
 * @module core/runtime/types
 */

/**
 * Arguments for the log_analyzer tool.
 */
export interface LogAnalyzerArgs {
  /** Source type: file or command */
  source: 'file' | 'command';
  /** Log file path (required when source is "file") */
  path?: string;
  /** Command to run and capture output (required when source is "command") */
  command?: string;
  /** Duration in seconds for command source (default: 10) */
  duration_seconds?: number;
  /** Number of lines to read from file source (default: 1000) */
  tail_lines?: number;
  /** Expect JSON logs (default: auto-detect) */
  structured?: boolean;
  /** Custom patterns to detect */
  patterns?: Array<{
    name: string;
    regex: string;
    level: 'debug' | 'info' | 'warn' | 'error';
  }>;
  /** Time window filter (e.g., "5m", "1h", "24h") */
  time_window?: string;
  /** Working directory */
  cwd?: string;
}

/**
 * Result of log analysis.
 */
export interface LogAnalyzerResult {
  entries_analyzed: number;
  time_range: {
    start: string | null;
    end: string | null;
    duration_ms: number | null;
  };
  format_detected: 'json' | 'text' | 'mixed';
  levels: {
    debug: number;
    info: number;
    warn: number;
    error: number;
    unknown: number;
  };
  errors: Array<{
    message: string;
    count: number;
    first_seen: string;
    last_seen: string;
    sample_stack?: string;
  }>;
  warnings: Array<{
    message: string;
    count: number;
    first_seen: string;
    last_seen: string;
    sample_stack?: string;
  }>;
  patterns_matched: Record<string, number>;
  anomalies: Array<{
    type: 'spike' | 'gap' | 'new_error' | 'rate_change';
    description: string;
    timestamp?: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  rate_analysis?: {
    entries_per_minute: number;
    errors_per_minute: number;
    peak_period: string;
  };
  source_info: {
    type: 'file' | 'command';
    path_or_command: string;
    lines_read: number;
  };
}

/**
 * Arguments for the detect_memory_leaks tool.
 */
export interface DetectMemoryLeaksArgs {
  /** Target type: 'pid' for existing process, 'command' to spawn new process */
  target: 'pid' | 'command';
  /** Process ID to monitor (required if target is 'pid') */
  pid?: number;
  /** Command to spawn and monitor (required if target is 'command') */
  command?: string;
  /** How long to monitor in seconds (default: 30) */
  duration_seconds?: number;
  /** Time between measurements in ms (default: 5000) */
  snapshot_interval_ms?: number;
  /** Minimum growth in MB to flag as leak (default: 10) */
  threshold_mb?: number;
  /** Working directory for command execution */
  cwd?: string;
}

/**
 * Memory snapshot taken at a point in time.
 */
export interface MemorySnapshot {
  /** ISO timestamp of when snapshot was taken */
  timestamp: string;
  /** Milliseconds since monitoring started */
  elapsed_ms: number;
  /** Heap memory currently in use (MB) - may be null for external processes */
  heap_used_mb: number | null;
  /** Total heap memory allocated (MB) - may be null for external processes */
  heap_total_mb: number | null;
  /** External memory usage (MB) - may be null for external processes */
  external_mb: number | null;
  /** Resident Set Size - total memory footprint (MB) */
  rss_mb: number;
}

/**
 * Memory trend analysis results.
 */
export interface MemoryAnalysis {
  /** Initial RSS memory in MB */
  initial_heap_mb: number;
  /** Final RSS memory in MB */
  final_heap_mb: number;
  /** Memory growth in MB (positive = grew) */
  heap_growth_mb: number;
  /** Growth rate in MB per minute */
  growth_rate_mb_per_minute: number;
  /** Overall trend classification */
  trend: 'stable' | 'growing' | 'declining';
  /** Linear regression results if enough data points */
  linear_regression?: {
    slope: number;
    intercept: number;
    r_squared: number;
  };
}

/**
 * Arguments for the profile_function tool.
 */
export interface ProfileFunctionArgs {
  /** Path to file containing function (relative to project root or absolute) */
  file: string;
  /** Name of the exported function to profile */
  function_name: string;
  /** Arguments to pass to the function */
  inputs: unknown[];
  /** Number of profiling iterations (default: 100) */
  iterations?: number;
  /** Number of warmup iterations (default: 10) */
  warmup?: number;
  /** Whether to track memory usage (default: false) */
  capture_memory?: boolean;
  /** Maximum time per iteration in milliseconds (default: 5000) */
  timeout?: number;
}

/**
 * Timing statistics from profiling.
 */
export interface TimingStats {
  /** Mean execution time in milliseconds */
  mean_ms: number;
  /** Median execution time in milliseconds */
  median_ms: number;
  /** 95th percentile execution time in milliseconds */
  p95_ms: number;
  /** 99th percentile execution time in milliseconds */
  p99_ms: number;
  /** Minimum execution time in milliseconds */
  min_ms: number;
  /** Maximum execution time in milliseconds */
  max_ms: number;
  /** Standard deviation of execution times in milliseconds */
  std_dev_ms: number;
  /** Total execution time for all iterations in milliseconds */
  total_ms: number;
}
