/**
 * Detect Memory Leaks Handler
 *
 * Monitors a process's memory usage over time to detect potential memory leaks.
 * Takes periodic snapshots, performs trend analysis, and calculates linear regression
 * to determine if memory usage is consistently growing.
 *
 * Cross-platform support for Windows and Unix systems.
 *
 * @module handlers/analysis/detect-memory-leaks
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';

import { success, error, safeExec } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the detect_memory_leaks MCP tool
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
 * Memory snapshot taken at a point in time
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
 * Linear regression result
 */
export interface LinearRegressionResult {
  /** Slope in MB per second (positive = growing) */
  slope: number;
  /** Intercept value */
  intercept: number;
  /** R-squared value (0-1, higher = better fit) */
  r_squared: number;
}

/**
 * Memory trend analysis results
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
  linear_regression?: LinearRegressionResult;
}

/**
 * Suspected memory leak source
 */
export interface LeakSuspect {
  /** Type of suspected leak */
  type: string;
  /** Description of the suspicion */
  description: string;
  /** Confidence level in this suspicion */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Result from detect_memory_leaks tool
 */
export interface DetectMemoryLeaksResult {
  /** Whether a memory leak was detected */
  leak_detected: boolean;
  /** Description of the monitored target */
  target: string;
  /** Actual monitoring duration in seconds */
  duration_seconds: number;
  /** Memory snapshots collected during monitoring */
  snapshots: MemorySnapshot[];
  /** Analysis of memory trends */
  analysis: MemoryAnalysis;
  /** Suspected leak sources (if leak detected) */
  suspects?: LeakSuspect[];
  /** Recommendations based on analysis */
  recommendations: string[];
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a process is alive using signal 0
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get memory usage for a process on Windows
 */
function getWindowsMemory(pid: number): { rss_mb: number } | null {
  try {
    const output = execSync(
      `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
      { encoding: 'utf-8', timeout: 5000 }
    );

    // Format: "process.exe","1234","Console","1","123,456 K"
    const csvMatch = output.match(/"[^"]+","(\d+)","[^"]+","[^"]+","([0-9,]+)\s*K"/);
    if (csvMatch && csvMatch[1] === String(pid)) {
      const memoryKB = parseInt(csvMatch[2].replace(/,/g, ''), 10);
      return { rss_mb: Math.round(memoryKB / 1024 * 100) / 100 };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get memory usage for a process on Unix/macOS
 */
function getUnixMemory(pid: number): { rss_mb: number } | null {
  try {
    const output = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf-8', timeout: 5000 });
    const rssKB = parseInt(output.trim(), 10);
    if (!isNaN(rssKB)) {
      return { rss_mb: Math.round(rssKB / 1024 * 100) / 100 };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get memory usage for a process (cross-platform)
 */
function getProcessMemory(pid: number): { rss_mb: number } | null {
  const isWindows = process.platform === 'win32';
  return isWindows ? getWindowsMemory(pid) : getUnixMemory(pid);
}

/**
 * Perform linear regression on x,y data points
 * Returns slope (MB/second), intercept, and R-squared
 */
function linearRegression(x: number[], y: number[]): LinearRegressionResult {
  const n = x.length;
  if (n < 2) {
    return { slope: 0, intercept: y[0] || 0, r_squared: 0 };
  }

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) {
    // All x values are the same
    return { slope: 0, intercept: sumY / n, r_squared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);

  if (ssTotal < 1e-10) {
    // All y values are the same
    return { slope: 0, intercept: yMean, r_squared: 1 };
  }

  const ssRes = y.reduce((sum, yi, i) => sum + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const rSquared = Math.max(0, Math.min(1, 1 - ssRes / ssTotal));

  return {
    slope: Math.round(slope * 1000000) / 1000000, // 6 decimal places
    intercept: Math.round(intercept * 100) / 100,
    r_squared: Math.round(rSquared * 1000) / 1000,
  };
}

/**
 * Analyze memory snapshots for trends
 */
function analyzeTrend(snapshots: MemorySnapshot[], durationSeconds: number): MemoryAnalysis {
  const rssValues = snapshots.map(s => s.rss_mb);
  const initial = rssValues[0];
  const final = rssValues[rssValues.length - 1];
  const growth = final - initial;

  // Calculate growth rate in MB per minute
  const growthRatePerMinute = durationSeconds > 0
    ? (growth / durationSeconds) * 60
    : 0;

  // Linear regression on time (seconds) vs memory (MB)
  const timeSeconds = snapshots.map(s => s.elapsed_ms / 1000);
  const regression = linearRegression(timeSeconds, rssValues);

  // Determine trend based on slope and R-squared
  // slope > 0.1 MB/s with reasonable fit = growing
  // slope < -0.1 MB/s with reasonable fit = declining
  // otherwise stable
  let trend: 'stable' | 'growing' | 'declining' = 'stable';

  if (regression.r_squared > 0.5) {
    // Good fit, use slope to determine trend
    if (regression.slope > 0.01) { // > 0.01 MB/s = 0.6 MB/min
      trend = 'growing';
    } else if (regression.slope < -0.01) {
      trend = 'declining';
    }
  } else if (growth > 5) {
    // Poor fit but significant growth
    trend = 'growing';
  } else if (growth < -5) {
    trend = 'declining';
  }

  return {
    initial_heap_mb: Math.round(initial * 100) / 100,
    final_heap_mb: Math.round(final * 100) / 100,
    heap_growth_mb: Math.round(growth * 100) / 100,
    growth_rate_mb_per_minute: Math.round(growthRatePerMinute * 100) / 100,
    trend,
    linear_regression: snapshots.length >= 3 ? regression : undefined,
  };
}

/**
 * Generate leak suspects based on analysis
 */
function generateSuspects(analysis: MemoryAnalysis): LeakSuspect[] {
  const suspects: LeakSuspect[] = [];

  // High growth rate with good linear fit
  if (analysis.linear_regression && analysis.linear_regression.r_squared > 0.8) {
    if (analysis.linear_regression.slope > 0.1) {
      suspects.push({
        type: 'consistent_growth',
        description: `Memory is growing consistently at ~${Math.round(analysis.linear_regression.slope * 60 * 100) / 100} MB/min with high correlation (R²=${analysis.linear_regression.r_squared})`,
        confidence: 'high',
      });
    }
  }

  // Large absolute growth
  if (analysis.heap_growth_mb > 50) {
    suspects.push({
      type: 'large_growth',
      description: `Memory grew by ${analysis.heap_growth_mb} MB during monitoring period`,
      confidence: analysis.heap_growth_mb > 100 ? 'high' : 'medium',
    });
  }

  // High growth rate
  if (analysis.growth_rate_mb_per_minute > 10) {
    suspects.push({
      type: 'rapid_growth',
      description: `Memory is growing at ${analysis.growth_rate_mb_per_minute} MB/minute`,
      confidence: analysis.growth_rate_mb_per_minute > 50 ? 'high' : 'medium',
    });
  }

  // If we have linear regression but moderate fit
  if (analysis.linear_regression &&
      analysis.linear_regression.r_squared > 0.5 &&
      analysis.linear_regression.r_squared <= 0.8 &&
      analysis.linear_regression.slope > 0.05) {
    suspects.push({
      type: 'probable_leak',
      description: `Memory shows growth pattern (slope=${analysis.linear_regression.slope} MB/s) with moderate correlation`,
      confidence: 'medium',
    });
  }

  return suspects;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  leakDetected: boolean,
  analysis: MemoryAnalysis,
  suspects: LeakSuspect[]
): string[] {
  const recommendations: string[] = [];

  if (leakDetected) {
    recommendations.push('Memory leak detected. Consider the following investigation steps:');

    if (suspects.some(s => s.confidence === 'high')) {
      recommendations.push('- Use Node.js --inspect flag and Chrome DevTools to take heap snapshots');
      recommendations.push('- Compare heap snapshots over time to identify growing object types');
    }

    if (analysis.growth_rate_mb_per_minute > 50) {
      recommendations.push('- URGENT: Rapid memory growth detected. This may cause OOM errors soon');
      recommendations.push('- Check for unbounded arrays, maps, or caches');
      recommendations.push('- Look for event listeners that are never removed');
    }

    recommendations.push('- Check for global variables accumulating data');
    recommendations.push('- Verify all timers and intervals are cleared on cleanup');
    recommendations.push('- Review closures that may hold references to large objects');
    recommendations.push('- Check for memory held by unresolved promises');
  } else if (analysis.trend === 'growing') {
    recommendations.push('Memory is growing but within acceptable bounds');
    recommendations.push('- Monitor over a longer period to confirm stability');
    recommendations.push('- Consider running with --expose-gc and manual GC triggers');
  } else if (analysis.trend === 'stable') {
    recommendations.push('Memory usage appears stable');
    recommendations.push('- No immediate action required');
    recommendations.push('- Consider periodic monitoring in production');
  } else {
    recommendations.push('Memory usage is declining (garbage collection active)');
    recommendations.push('- This is typically healthy behavior');
  }

  return recommendations;
}

/**
 * Spawn a command and return the child process
 */
function spawnCommand(command: string, cwd: string): ChildProcess {
  const isWindows = process.platform === 'win32';
  const shell = isWindows ? true : '/bin/sh';
  const args = isWindows ? [] : ['-c', command];
  const cmd = isWindows ? command : '/bin/sh';

  return spawn(cmd, args, {
    cwd,
    shell: isWindows ? true : false,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
  });
}

/**
 * Handles the detect_memory_leaks MCP tool call.
 *
 * Monitors a process's memory usage over time to detect potential memory leaks.
 * Takes periodic snapshots and performs statistical analysis including linear
 * regression to determine if memory usage is consistently growing.
 *
 * @param args - The detect_memory_leaks tool arguments
 * @param args.target - 'pid' to monitor existing process, 'command' to spawn new
 * @param args.pid - Process ID (required if target is 'pid')
 * @param args.command - Command to run (required if target is 'command')
 * @param args.duration_seconds - How long to monitor (default: 30)
 * @param args.snapshot_interval_ms - Time between snapshots (default: 5000)
 * @param args.threshold_mb - Growth threshold to flag as leak (default: 10)
 * @param args.cwd - Working directory for command
 * @returns MCP tool response with leak detection results
 *
 * @example
 * // Monitor an existing process by PID
 * handleDetectMemoryLeaks({ target: 'pid', pid: 1234, duration_seconds: 60 });
 *
 * @example
 * // Spawn and monitor a command
 * handleDetectMemoryLeaks({
 *   target: 'command',
 *   command: 'npm run dev',
 *   duration_seconds: 30
 * });
 */
export async function handleDetectMemoryLeaks(args: DetectMemoryLeaksArgs) {
  const {
    target,
    pid: inputPid,
    command,
    duration_seconds = 30,
    snapshot_interval_ms = 5000,
    threshold_mb = 10,
    cwd = PROJECT_ROOT,
  } = args;

  // Validate arguments
  if (target === 'pid' && (!inputPid || inputPid <= 0)) {
    return error('Invalid or missing PID for target type "pid"');
  }

  if (target === 'command' && !command) {
    return error('Missing command for target type "command"');
  }

  // Cap duration at 10 minutes for safety
  const maxDuration = Math.min(duration_seconds, 600);
  const actualCwd = path.resolve(cwd);

  let monitoredPid: number;
  let childProcess: ChildProcess | null = null;
  let targetDescription: string;

  // Set up the process to monitor
  if (target === 'command') {
    try {
      childProcess = spawnCommand(command!, actualCwd);

      // Wait a moment for the process to start
      await sleep(1000);

      if (!childProcess.pid || !isProcessAlive(childProcess.pid)) {
        return error(`Failed to start command: ${command}`);
      }

      monitoredPid = childProcess.pid;
      targetDescription = `command: ${command} (PID: ${monitoredPid})`;
    } catch (err) {
      return error(`Failed to spawn command: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    monitoredPid = inputPid!;
    targetDescription = `PID: ${monitoredPid}`;

    if (!isProcessAlive(monitoredPid)) {
      return error(`Process with PID ${monitoredPid} is not running`);
    }
  }

  // Collect memory snapshots
  const snapshots: MemorySnapshot[] = [];
  const startTime = Date.now();
  const endTime = startTime + maxDuration * 1000;
  let lastSnapshotTime = 0;

  try {
    while (Date.now() < endTime) {
      const now = Date.now();
      const elapsed = now - startTime;

      // Check if process is still alive
      if (!isProcessAlive(monitoredPid)) {
        break;
      }

      // Take snapshot at interval
      if (elapsed - lastSnapshotTime >= snapshot_interval_ms || snapshots.length === 0) {
        const memory = getProcessMemory(monitoredPid);

        if (memory) {
          snapshots.push({
            timestamp: new Date().toISOString(),
            elapsed_ms: elapsed,
            heap_used_mb: null, // Not available for external processes
            heap_total_mb: null,
            external_mb: null,
            rss_mb: memory.rss_mb,
          });
        }

        lastSnapshotTime = elapsed;
      }

      // Sleep until next interval or end
      const nextSnapshotTime = lastSnapshotTime + snapshot_interval_ms;
      const sleepTime = Math.min(nextSnapshotTime - (Date.now() - startTime), endTime - Date.now());

      if (sleepTime > 0) {
        await sleep(Math.min(sleepTime, 1000)); // Check every second at most
      }
    }
  } finally {
    // Clean up spawned process if we created it
    if (childProcess && childProcess.pid) {
      try {
        // Kill the process tree
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${childProcess.pid} /T /F`, { encoding: 'utf-8', timeout: 5000 });
        } else {
          process.kill(-childProcess.pid, 'SIGTERM');
        }
      } catch {
        // Process may have already exited
        try {
          childProcess.kill('SIGTERM');
        } catch {
          // Ignore
        }
      }
    }
  }

  // Need at least 2 snapshots for meaningful analysis
  if (snapshots.length < 2) {
    return error('Insufficient data collected. Process may have exited too quickly or memory data unavailable.');
  }

  // Calculate actual duration
  const actualDuration = (snapshots[snapshots.length - 1].elapsed_ms) / 1000;

  // Analyze the snapshots
  const analysis = analyzeTrend(snapshots, actualDuration);

  // Determine if leak is detected based on threshold and analysis
  const leakDetected =
    analysis.heap_growth_mb >= threshold_mb &&
    analysis.trend === 'growing' &&
    (analysis.linear_regression?.r_squared ?? 0) > 0.5;

  // Generate suspects and recommendations
  const suspects = leakDetected ? generateSuspects(analysis) : undefined;
  const recommendations = generateRecommendations(leakDetected, analysis, suspects || []);

  const result: DetectMemoryLeaksResult = {
    leak_detected: leakDetected,
    target: targetDescription,
    duration_seconds: Math.round(actualDuration * 100) / 100,
    snapshots,
    analysis,
    suspects,
    recommendations,
  };

  return success(result);
}
