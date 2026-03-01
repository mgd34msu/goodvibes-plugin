/**
 * Shared types for the runtime domain.
 *
 * @module core/runtime/types
 */

import type { LogAnalyzerArgs as _LogAnalyzerArgs, LogAnalyzerResult as _LogAnalyzerResult } from '../../handlers/runtime/logs.js';
import type { DetectMemoryLeaksArgs as _DetectMemoryLeaksArgs } from '../../handlers/runtime/memory.js';
import type { ProfileFunctionArgs as _ProfileFunctionArgs, TimingStats as _TimingStats } from '../../handlers/runtime/profile.js';

/**
 * Arguments for the log_analyzer tool.
 *
 * Re-exported from the handler for use across layers.
 */
export type LogAnalyzerArgs = _LogAnalyzerArgs;

/**
 * Result of log analysis.
 *
 * Re-exported from the handler for use across layers.
 */
export type LogAnalyzerResult = _LogAnalyzerResult;

/**
 * Arguments for the detect_memory_leaks tool.
 *
 * Re-exported from the handler for use across layers.
 */
export type DetectMemoryLeaksArgs = _DetectMemoryLeaksArgs;

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
 *
 * Re-exported from the handler for use across layers.
 */
export type ProfileFunctionArgs = _ProfileFunctionArgs;

/**
 * Timing statistics from profiling.
 *
 * Re-exported from the handler for use across layers.
 */
export type TimingStats = _TimingStats;
