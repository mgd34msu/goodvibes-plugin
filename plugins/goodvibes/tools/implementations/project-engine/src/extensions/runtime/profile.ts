/**
 * profileFunction — L2 extension for the runtime domain.
 *
 * Composes L1 core/runtime utilities to profile a JavaScript/TypeScript
 * function's performance with statistical analysis.
 *
 * @module extensions/runtime/profile
 */

import * as node_path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';
import { fileExists } from '../../shared/utils.js';

import type { ProfileFunctionArgs } from '../../core/runtime/types.js';
import { extractFunction } from '../../core/runtime/profiler.js';
import { calculateTimingStats } from '../../core/runtime/statistics.js';
import { formatProfileResult, type ProfileResultShape } from '../../core/runtime/formatters.js';

/** Memory usage statistics */
interface MemoryStats {
  heap_used_before_mb: number;
  heap_used_after_mb: number;
  heap_delta_mb: number;
  external_delta_mb: number;
}

/** Result of profiling a function — extends the shared formatter shape with memory stats */
interface ProfileFunctionResult extends ProfileResultShape {
  memory?: MemoryStats;
}

/** Converts bytes to megabytes with 4 decimal places */
function bytesToMb(bytes: number): number {
  const factor = Math.pow(10, 4);
  return Math.round((bytes / (1024 * 1024)) * factor) / factor;
}

/** Checks if a value is a Promise */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}

/**
 * Executes a function with timeout protection.
 */
async function executeWithTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number
): Promise<T> {
  const result = fn();

  if (!isPromise(result)) {
    return result;
  }

  // Clear the timer on both success and failure to prevent timer leaks
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Function execution timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    (result as Promise<T>)
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err as Error); });
  });
}

/**
 * Resolves a file path with TypeScript/JavaScript extension fallbacks.
 */
async function resolveFilePath(file: string): Promise<string | null> {
  const absolutePath = node_path.isAbsolute(file)
    ? file
    : node_path.resolve(PROJECT_ROOT, file);

  if (await fileExists(absolutePath)) {
    return absolutePath;
  }

  // Try common extensions if no extension provided
  const ext = node_path.extname(absolutePath);
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
 * Imports a module dynamically, handling both ESM and CJS.
 */
async function importModule(absolutePath: string): Promise<Record<string, unknown>> {
  const ext = node_path.extname(absolutePath).toLowerCase();

  if (ext === '.ts' || ext === '.tsx') {
    try {
      const fileUrl = pathToFileURL(absolutePath).href;
      return await import(fileUrl) as Record<string, unknown>;
    } catch (directError) {
      const jsPath = absolutePath.replace(/\.tsx?$/, '.js');
      if (await fileExists(jsPath)) {
        const fileUrl = pathToFileURL(jsPath).href;
        return await import(fileUrl) as Record<string, unknown>;
      }

      /* v8 ignore start -- Node.js import always throws Error objects */
      throw new Error(
        `Cannot import TypeScript file directly. Error: ${directError instanceof Error ? directError.message : String(directError)}. ` +
        `Consider running with tsx/ts-node or compile to JavaScript first.`
      );
      /* v8 ignore stop */
    }
  }

  const fileUrl = pathToFileURL(absolutePath).href;
  return await import(fileUrl) as Record<string, unknown>;
}

/**
 * Profiles a JavaScript/TypeScript function's performance.
 *
 * - Dynamically imports the file containing the function
 * - Runs warmup iterations to stabilize JIT compilation
 * - Measures execution time over multiple iterations
 * - Calculates statistical metrics (mean, median, percentiles, std dev)
 * - Optionally tracks memory usage
 *
 * @param args - The profile_function tool arguments
 * @returns MCP tool response with profiling results
 */
export async function profileFunction(args: ProfileFunctionArgs): Promise<McpResponse> {
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
    return ok(formatProfileResult(buildErrorResult(function_name || '', file || '', iterations, warmup, 'file is required')));
  }
  if (!function_name) {
    return ok(formatProfileResult(buildErrorResult(function_name || '', file, iterations, warmup, 'function_name is required')));
  }
  if (!Array.isArray(inputs)) {
    return ok(formatProfileResult(buildErrorResult(function_name, file, iterations, warmup, 'inputs must be an array of arguments')));
  }

  // Resolve file path
  const absolutePath = await resolveFilePath(file);
  if (!absolutePath) {
    return ok(formatProfileResult(buildErrorResult(function_name, file, iterations, warmup, `File not found: ${file}`)));
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
      result.error = `Function '${function_name}' not found in module. Available exports: ${available || 'none'}`;
      return ok(formatProfileResult(result));
    }

    // Memory tracking setup
    let memBefore: NodeJS.MemoryUsage | null = null;
    let memAfter: NodeJS.MemoryUsage | null = null;
    let externalBefore = 0;

    if (capture_memory) {
      // Run GC before snapshot if available (requires --expose-gc flag)
      if (global.gc) global.gc();
      memBefore = process.memoryUsage();
      externalBefore = memBefore.external;
    }

    // Warmup iterations
    for (let i = 0; i < warmup; i++) {
      try {
        await executeWithTimeout(() => fn(...inputs), timeout);
      } catch {
        // Ignore warmup errors
      }
    }

    // Profiling iterations
    const times: number[] = [];
    // Use a boolean flag to distinguish "no result yet" from undefined result value
    let hasSampleResult = false;
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
        if (!hasSampleResult) {
          sampleResult = iterResult;
          hasSampleResult = true;
        }
      } catch (iterError) {
        lastError = iterError instanceof Error ? iterError : new Error(String(iterError));
      }
    }

    // Update actual iterations count
    result.iterations = successfulIterations;

    // Calculate timing statistics
    if (times.length > 0) {
      result.timing = calculateTimingStats(times);
    }

    // Memory tracking
    if (capture_memory) {
      if (global.gc) {
        global.gc();
      }
      memAfter = process.memoryUsage();

      /* v8 ignore start -- memBefore/memAfter always defined when capture_memory=true */
      if (memBefore && memAfter) {
        result.memory = {
          heap_used_before_mb: bytesToMb(memBefore.heapUsed),
          heap_used_after_mb: bytesToMb(memAfter.heapUsed),
          heap_delta_mb: bytesToMb(memAfter.heapUsed - memBefore.heapUsed),
          external_delta_mb: bytesToMb(memAfter.external - externalBefore),
        };
      }
      /* v8 ignore stop */
    }

    // Include sample result (truncate if too large)
    if (hasSampleResult) {
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

    return ok(formatProfileResult(result));
  } catch (importError) {
    result.error = importError instanceof Error ? importError.message : String(importError);
    return ok(formatProfileResult(result));
  }
}

/**
 * Builds an error result shape for early validation failures.
 */
function buildErrorResult(
  functionName: string,
  file: string,
  iterations: number,
  warmup: number,
  errorMessage: string
): ProfileFunctionResult {
  return {
    function_name: functionName,
    file,
    iterations,
    warmup_iterations: warmup,
    timing: {
      mean_ms: 0, median_ms: 0, p95_ms: 0, p99_ms: 0,
      min_ms: 0, max_ms: 0, std_dev_ms: 0, total_ms: 0,
    },
    error: errorMessage,
  };
}
