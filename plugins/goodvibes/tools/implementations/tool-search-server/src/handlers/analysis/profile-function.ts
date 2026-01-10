/**
 * Profile Function Handler
 *
 * Profiles JavaScript/TypeScript function performance:
 * - Dynamic function import (ESM and CJS)
 * - Timing with warmup iterations
 * - Statistical analysis (mean, median, p95, p99, std dev)
 * - Optional memory tracking
 * - Support for async functions
 */

import * as path from 'path';
import { pathToFileURL } from 'url';
import { performance } from 'perf_hooks';

import { PROJECT_ROOT } from '../../config.js';
import { success, error, fileExists } from '../../utils.js';

/**
 * Arguments for the profile_function tool
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
 * Timing statistics from profiling
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

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  /** Heap used before profiling in MB */
  heap_used_before_mb: number;
  /** Heap used after profiling in MB */
  heap_used_after_mb: number;
  /** Change in heap usage in MB */
  heap_delta_mb: number;
  /** Change in external memory in MB */
  external_delta_mb: number;
}

/**
 * Result of profiling a function
 */
export interface ProfileFunctionResult {
  /** Name of the profiled function */
  function_name: string;
  /** Path to the file containing the function */
  file: string;
  /** Number of profiling iterations performed */
  iterations: number;
  /** Number of warmup iterations performed */
  warmup_iterations: number;
  /** Timing statistics */
  timing: TimingStats;
  /** Memory statistics (if capture_memory was true) */
  memory?: MemoryStats;
  /** Sample return value from one execution */
  result_sample?: unknown;
  /** Error message if profiling failed */
  error?: string;
}

/**
 * Calculate statistical metrics from timing data
 */
function calculateStats(times: number[]): TimingStats {
  if (times.length === 0) {
    return {
      mean_ms: 0,
      median_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      min_ms: 0,
      max_ms: 0,
      std_dev_ms: 0,
      total_ms: 0,
    };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const mean = sum / times.length;

  // Median
  const midIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
      : sorted[midIndex];

  // Percentiles
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);
  const p95 = sorted[Math.min(p95Index, sorted.length - 1)];
  const p99 = sorted[Math.min(p99Index, sorted.length - 1)];

  // Standard deviation
  const variance =
    times.reduce((sumSq, t) => sumSq + (t - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean_ms: roundTo(mean, 4),
    median_ms: roundTo(median, 4),
    p95_ms: roundTo(p95, 4),
    p99_ms: roundTo(p99, 4),
    min_ms: roundTo(sorted[0], 4),
    max_ms: roundTo(sorted[sorted.length - 1], 4),
    std_dev_ms: roundTo(stdDev, 4),
    total_ms: roundTo(sum, 4),
  };
}

/**
 * Round a number to specified decimal places
 */
function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Convert bytes to megabytes
 */
function bytesToMb(bytes: number): number {
  return roundTo(bytes / (1024 * 1024), 4);
}

/**
 * Check if a value is a Promise
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}

/**
 * Execute a function with timeout protection
 */
async function executeWithTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number
): Promise<T> {
  const result = fn();

  if (!isPromise(result)) {
    return result;
  }

  return Promise.race([
    result,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Function execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Format the profiling result as readable markdown
 */
function formatResult(result: ProfileFunctionResult): string {
  const lines: string[] = [];

  lines.push('## Function Profile Results');
  lines.push('');
  lines.push(`**Function:** \`${result.function_name}\``);
  lines.push(`**File:** \`${result.file}\``);
  lines.push(`**Iterations:** ${result.iterations} (warmup: ${result.warmup_iterations})`);
  lines.push('');

  if (result.error) {
    lines.push('### Error');
    lines.push(`\`\`\`\n${result.error}\n\`\`\``);
    lines.push('');
  }

  lines.push('### Timing Statistics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Mean | ${result.timing.mean_ms.toFixed(4)} ms |`);
  lines.push(`| Median | ${result.timing.median_ms.toFixed(4)} ms |`);
  lines.push(`| P95 | ${result.timing.p95_ms.toFixed(4)} ms |`);
  lines.push(`| P99 | ${result.timing.p99_ms.toFixed(4)} ms |`);
  lines.push(`| Min | ${result.timing.min_ms.toFixed(4)} ms |`);
  lines.push(`| Max | ${result.timing.max_ms.toFixed(4)} ms |`);
  lines.push(`| Std Dev | ${result.timing.std_dev_ms.toFixed(4)} ms |`);
  lines.push(`| Total | ${result.timing.total_ms.toFixed(2)} ms |`);
  lines.push('');

  if (result.memory) {
    lines.push('### Memory Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Heap Before | ${result.memory.heap_used_before_mb.toFixed(4)} MB |`);
    lines.push(`| Heap After | ${result.memory.heap_used_after_mb.toFixed(4)} MB |`);
    lines.push(`| Heap Delta | ${result.memory.heap_delta_mb.toFixed(4)} MB |`);
    lines.push(`| External Delta | ${result.memory.external_delta_mb.toFixed(4)} MB |`);
    lines.push('');
  }

  if (result.result_sample !== undefined) {
    lines.push('### Sample Return Value');
    lines.push('');
    lines.push('```json');
    try {
      lines.push(JSON.stringify(result.result_sample, null, 2));
    } catch {
      lines.push(String(result.result_sample));
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Resolve file path with TypeScript/JavaScript extension fallbacks
 */
async function resolveFilePath(file: string): Promise<string | null> {
  // First, try the exact path
  const absolutePath = path.isAbsolute(file)
    ? file
    : path.resolve(PROJECT_ROOT, file);

  if (await fileExists(absolutePath)) {
    return absolutePath;
  }

  // Try common extensions if no extension provided
  const ext = path.extname(absolutePath);
  if (!ext) {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    for (const extension of extensions) {
      const withExt = absolutePath + extension;
      if (await fileExists(withExt)) {
        return withExt;
      }
    }
  }

  return null;
}

/**
 * Import a module dynamically, handling both ESM and CJS
 */
async function importModule(absolutePath: string): Promise<Record<string, unknown>> {
  const ext = path.extname(absolutePath).toLowerCase();

  // For TypeScript files, we need to check for tsx/ts-node
  if (ext === '.ts' || ext === '.tsx') {
    // Try to use tsx or ts-node if available
    // First attempt: direct import (works if tsx/ts-node is registered)
    try {
      const fileUrl = pathToFileURL(absolutePath).href;
      return await import(fileUrl) as Record<string, unknown>;
    } catch (directError) {
      // If direct import fails, try to find compiled JS
      const jsPath = absolutePath.replace(/\.tsx?$/, '.js');
      if (await fileExists(jsPath)) {
        const fileUrl = pathToFileURL(jsPath).href;
        return await import(fileUrl) as Record<string, unknown>;
      }

      // Try dist folder
      const distPath = absolutePath
        .replace(/[/\\]src[/\\]/, '/dist/')
        .replace(/\.tsx?$/, '.js');
      if (await fileExists(distPath)) {
        const fileUrl = pathToFileURL(distPath).href;
        return await import(fileUrl) as Record<string, unknown>;
      }

      throw new Error(
        `Cannot import TypeScript file directly. Error: ${directError instanceof Error ? directError.message : String(directError)}. ` +
        `Consider running with tsx/ts-node or compile to JavaScript first.`
      );
    }
  }

  // For JS files, use file URL for ESM compatibility
  const fileUrl = pathToFileURL(absolutePath).href;
  return await import(fileUrl) as Record<string, unknown>;
}

/**
 * Extract function from module exports
 */
function extractFunction(
  module: Record<string, unknown>,
  functionName: string
): ((...args: unknown[]) => unknown) | null {
  // Direct export
  if (typeof module[functionName] === 'function') {
    return module[functionName] as (...args: unknown[]) => unknown;
  }

  // Default export with named function
  const defaultExport = module.default;
  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    typeof (defaultExport as Record<string, unknown>)[functionName] === 'function'
  ) {
    return (defaultExport as Record<string, unknown>)[functionName] as (...args: unknown[]) => unknown;
  }

  // Default export is the function itself (for default export functions)
  if (functionName === 'default' && typeof defaultExport === 'function') {
    return defaultExport as (...args: unknown[]) => unknown;
  }

  return null;
}

/**
 * Handles the profile_function MCP tool call.
 *
 * Profiles a JavaScript/TypeScript function's performance by:
 * - Dynamically importing the file containing the function
 * - Running warmup iterations to stabilize JIT compilation
 * - Measuring execution time over multiple iterations
 * - Calculating statistical metrics (mean, median, percentiles, std dev)
 * - Optionally tracking memory usage
 *
 * @param args - The profile_function tool arguments
 * @param args.file - Path to the file containing the function
 * @param args.function_name - Name of the exported function to profile
 * @param args.inputs - Arguments to pass to the function
 * @param args.iterations - Number of profiling iterations (default: 100)
 * @param args.warmup - Number of warmup iterations (default: 10)
 * @param args.capture_memory - Whether to track memory usage (default: false)
 * @param args.timeout - Max time per iteration in ms (default: 5000)
 * @returns MCP tool response with profiling results
 *
 * @example
 * handleProfileFunction({
 *   file: "src/utils/sort.ts",
 *   function_name: "quickSort",
 *   inputs: [[3, 1, 4, 1, 5, 9, 2, 6]],
 *   iterations: 1000,
 *   warmup: 50,
 *   capture_memory: true
 * });
 */
export async function handleProfileFunction(
  args: ProfileFunctionArgs
): Promise<ReturnType<typeof success> | ReturnType<typeof error>> {
  const {
    file,
    function_name,
    inputs,
    iterations = 100,
    warmup = 10,
    capture_memory = false,
    timeout = 5000,
  } = args;

  // Validate arguments
  if (!file) {
    return error('file is required');
  }
  if (!function_name) {
    return error('function_name is required');
  }
  if (!Array.isArray(inputs)) {
    return error('inputs must be an array of arguments');
  }

  // Resolve file path
  const absolutePath = await resolveFilePath(file);
  if (!absolutePath) {
    return error(`File not found: ${file}`);
  }

  // Initialize result structure
  const result: ProfileFunctionResult = {
    function_name,
    file: absolutePath,
    iterations,
    warmup_iterations: warmup,
    timing: {
      mean_ms: 0,
      median_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      min_ms: 0,
      max_ms: 0,
      std_dev_ms: 0,
      total_ms: 0,
    },
  };

  try {
    // Import the module
    const module = await importModule(absolutePath);

    // Extract the function
    const fn = extractFunction(module, function_name);
    if (!fn) {
      const available = Object.keys(module)
        .filter((k) => typeof module[k] === 'function')
        .join(', ');
      return error(
        `Function '${function_name}' not found in module. ` +
        `Available exports: ${available || 'none'}`
      );
    }

    // Memory tracking setup
    let memBefore: NodeJS.MemoryUsage | null = null;
    let memAfter: NodeJS.MemoryUsage | null = null;
    let externalBefore = 0;

    if (capture_memory && global.gc) {
      global.gc();
      memBefore = process.memoryUsage();
      externalBefore = memBefore.external;
    } else if (capture_memory) {
      memBefore = process.memoryUsage();
      externalBefore = memBefore.external;
    }

    // Warmup iterations
    for (let i = 0; i < warmup; i++) {
      try {
        await executeWithTimeout(() => fn(...inputs), timeout);
      } catch (warmupError) {
        // Ignore warmup errors, they'll be caught in actual runs
      }
    }

    // Profiling iterations
    const times: number[] = [];
    let sampleResult: unknown;
    let lastError: Error | null = null;
    let successfulIterations = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        const iterResult = await executeWithTimeout(() => fn(...inputs), timeout);
        const elapsed = performance.now() - start;

        times.push(elapsed);
        successfulIterations++;

        // Capture sample result from first successful iteration
        if (sampleResult === undefined) {
          sampleResult = iterResult;
        }
      } catch (iterError) {
        lastError = iterError instanceof Error ? iterError : new Error(String(iterError));
      }
    }

    // Update actual iterations count
    result.iterations = successfulIterations;

    // Calculate timing statistics
    if (times.length > 0) {
      result.timing = calculateStats(times);
    }

    // Memory tracking
    if (capture_memory) {
      if (global.gc) {
        global.gc();
      }
      memAfter = process.memoryUsage();

      if (memBefore && memAfter) {
        result.memory = {
          heap_used_before_mb: bytesToMb(memBefore.heapUsed),
          heap_used_after_mb: bytesToMb(memAfter.heapUsed),
          heap_delta_mb: bytesToMb(memAfter.heapUsed - memBefore.heapUsed),
          external_delta_mb: bytesToMb(memAfter.external - externalBefore),
        };
      }
    }

    // Include sample result (truncate if too large)
    if (sampleResult !== undefined) {
      try {
        const serialized = JSON.stringify(sampleResult);
        if (serialized.length < 10000) {
          result.result_sample = sampleResult;
        } else {
          result.result_sample = '[Result too large to display]';
        }
      } catch {
        result.result_sample = '[Result not serializable]';
      }
    }

    // Include error if some iterations failed
    if (lastError && successfulIterations < iterations) {
      result.error = `${iterations - successfulIterations} iterations failed. Last error: ${lastError.message}`;
    }

    return success(formatResult(result));
  } catch (importError) {
    result.error = importError instanceof Error ? importError.message : String(importError);
    return success(formatResult(result));
  }
}
