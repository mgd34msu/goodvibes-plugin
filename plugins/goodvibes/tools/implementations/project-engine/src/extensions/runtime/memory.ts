/**
 * detectMemoryLeaks — L2 extension for the runtime domain.
 *
 * Composes L1 core/runtime utilities to monitor a process's memory usage
 * over time and detect potential memory leaks using statistical analysis.
 *
 * @module extensions/runtime/memory
 */

import * as node_path from 'node:path';
import { execFileSync, type ChildProcess } from 'node:child_process';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';
import { sleep } from '../../shared/utils.js';

import type { DetectMemoryLeaksArgs, MemorySnapshot } from '../../core/runtime/types.js';
import {
  isProcessAlive,
  getProcessMemory,
  spawnCommand,
} from '../../core/runtime/process-utils.js';
import {
  analyzeMemoryTrend,
  generateLeakSuspects,
  generateMemoryRecommendations,
} from '../../core/runtime/statistics.js';

/**
 * Detects potential memory leaks by monitoring a process's memory usage.
 *
 * Takes periodic RSS snapshots and applies linear regression to determine
 * if memory is consistently growing beyond the configured threshold.
 *
 * @param args - The detect_memory_leaks tool arguments
 * @returns MCP tool response with leak detection results
 */
export async function detectMemoryLeaks(args: DetectMemoryLeaksArgs): Promise<McpResponse> {
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
    return fail('Invalid or missing PID for target type "pid"');
  }

  if (target === 'command' && !command) {
    return fail('Missing command for target type "command"');
  }

  // Cap duration at 10 minutes for safety
  const maxDuration = Math.min(duration_seconds, 600);
  const actualCwd = node_path.resolve(cwd);

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
        return fail(`Failed to start command: ${command}`);
      }

      monitoredPid = childProcess.pid;
      targetDescription = `command: ${command} (PID: ${monitoredPid})`;
    } catch (err) {
      return fail(`Failed to spawn command: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    monitoredPid = inputPid!;
    targetDescription = `PID: ${monitoredPid}`;

    if (!isProcessAlive(monitoredPid)) {
      return fail(`Process with PID ${monitoredPid} is not running`);
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
          execFileSync('taskkill', ['/PID', String(childProcess.pid), '/T', '/F'], { encoding: 'utf-8', timeout: 5000 });
        } else {
          try {
            process.kill(-childProcess.pid, 'SIGTERM');
          } catch {
            // Negative PID kill may fail (e.g., if process already exited or not a group leader)
            childProcess.kill('SIGTERM');
          }
        }
      } catch {
        // Process may have already exited
      }
    }
  }

  // Need at least 2 snapshots for meaningful analysis
  if (snapshots.length < 2) {
    return fail('Insufficient data collected. Process may have exited too quickly or memory data unavailable.');
  }

  // Calculate actual duration
  const actualDuration = (snapshots[snapshots.length - 1].elapsed_ms) / 1000;

  // Analyze the snapshots
  const analysis = analyzeMemoryTrend(snapshots, actualDuration);

  // Determine if leak is detected based on threshold and analysis
  const leakDetected =
    analysis.heap_growth_mb >= threshold_mb &&
    analysis.trend === 'growing' &&
    (analysis.linear_regression?.r_squared ?? 0) > 0.5;

  // Generate suspects and recommendations
  const suspects = leakDetected ? generateLeakSuspects(analysis) : undefined;
  const recommendations = generateMemoryRecommendations(leakDetected, analysis, suspects || []);

  const result = {
    leak_detected: leakDetected,
    target: targetDescription,
    duration_seconds: Math.round(actualDuration * 100) / 100,
    snapshots,
    analysis,
    suspects,
    recommendations,
  };

  return ok(result);
}
