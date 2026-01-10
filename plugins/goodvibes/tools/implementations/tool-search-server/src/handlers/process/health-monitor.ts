/**
 * Health Monitor Handler
 *
 * Monitors a running process for health status, including CPU/memory usage,
 * HTTP health checks, and error pattern detection.
 *
 * Cross-platform support for Windows and Unix systems.
 *
 * @module handlers/process/health-monitor
 */

import * as http from 'http';
import * as https from 'https';
import * as os from 'os';

import { success, safeExec } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the health_monitor MCP tool
 */
export interface HealthMonitorArgs {
  /** Process ID to monitor */
  pid: number;
  /** Optional HTTP health check URL */
  health_url?: string;
  /** Regex patterns to flag as errors in process output (default common error patterns) */
  error_patterns?: string[];
  /** Milliseconds between checks when using duration (default: 5000) */
  sample_interval?: number;
  /** How long to monitor in ms (default: 0 = instant snapshot) */
  duration?: number;
}

/**
 * Error or warning captured during monitoring
 */
interface MonitoringEvent {
  timestamp: string;
  message: string;
}

/**
 * Result of an HTTP health check
 */
interface HealthCheckResult {
  url: string;
  status: number;
  latency_ms: number;
  ok: boolean;
}

/**
 * Result from health_monitor tool
 */
interface HealthMonitorResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'crashed' | 'not_found';
  pid: number;
  alive: boolean;
  uptime_ms: number | null;
  memory_mb: number | null;
  cpu_percent: number | null;
  errors: MonitoringEvent[];
  warnings: MonitoringEvent[];
  last_health_check?: HealthCheckResult;
}

/**
 * Process metrics collected during monitoring
 */
interface ProcessMetrics {
  alive: boolean;
  memory_mb: number | null;
  cpu_percent: number | null;
  uptime_ms: number | null;
}

// Default error patterns to detect in process output
const DEFAULT_ERROR_PATTERNS = [
  'error',
  'exception',
  'fatal',
  'failed',
  'crash',
  'ECONNREFUSED',
  'ENOENT',
  'ETIMEDOUT',
  'unhandled',
  'uncaught',
];

// Default warning patterns
const DEFAULT_WARNING_PATTERNS = [
  'warn',
  'warning',
  'deprecated',
  'timeout',
  'retry',
  'slow',
];

/**
 * Check if a process is alive using signal 0
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 doesn't kill the process but checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get process metrics on Windows using tasklist/wmic
 */
async function getWindowsProcessMetrics(pid: number): Promise<ProcessMetrics> {
  const metrics: ProcessMetrics = {
    alive: false,
    memory_mb: null,
    cpu_percent: null,
    uptime_ms: null,
  };

  // Check if process exists and get basic info
  const tasklistResult = await safeExec(
    `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
    PROJECT_ROOT,
    5000
  );

  if (tasklistResult.error || !tasklistResult.stdout.includes(String(pid))) {
    return metrics;
  }

  metrics.alive = true;

  // Parse memory from tasklist output
  // Format: "process.exe","1234","Console","1","123,456 K"
  const csvMatch = tasklistResult.stdout.match(/"[^"]+","(\d+)","[^"]+","[^"]+","([0-9,]+)\s*K"/);
  if (csvMatch) {
    const memoryKB = parseInt(csvMatch[2].replace(/,/g, ''), 10);
    metrics.memory_mb = Math.round(memoryKB / 1024 * 100) / 100;
  }

  // Try to get CPU usage using wmic (may not work on all Windows versions)
  try {
    const wmicResult = await safeExec(
      `wmic path Win32_PerfFormattedData_PerfProc_Process where "IDProcess=${pid}" get PercentProcessorTime /format:value`,
      PROJECT_ROOT,
      5000
    );

    if (!wmicResult.error && wmicResult.stdout) {
      const cpuMatch = wmicResult.stdout.match(/PercentProcessorTime=(\d+)/);
      if (cpuMatch) {
        // Divide by number of CPUs to normalize
        metrics.cpu_percent = Math.round(parseInt(cpuMatch[1], 10) / os.cpus().length * 100) / 100;
      }
    }
  } catch {
    // wmic may not be available on newer Windows
  }

  // Try to get process start time using wmic
  try {
    const startTimeResult = await safeExec(
      `wmic process where "ProcessId=${pid}" get CreationDate /format:value`,
      PROJECT_ROOT,
      5000
    );

    if (!startTimeResult.error && startTimeResult.stdout) {
      // CreationDate format: YYYYMMDDHHMMSS.MMMMMM+UUU
      const dateMatch = startTimeResult.stdout.match(/CreationDate=(\d{14})/);
      if (dateMatch) {
        const dateStr = dateMatch[1];
        const year = parseInt(dateStr.substring(0, 4), 10);
        const month = parseInt(dateStr.substring(4, 6), 10) - 1;
        const day = parseInt(dateStr.substring(6, 8), 10);
        const hour = parseInt(dateStr.substring(8, 10), 10);
        const minute = parseInt(dateStr.substring(10, 12), 10);
        const second = parseInt(dateStr.substring(12, 14), 10);

        const startTime = new Date(year, month, day, hour, minute, second);
        metrics.uptime_ms = Date.now() - startTime.getTime();
      }
    }
  } catch {
    // wmic may not be available
  }

  return metrics;
}

/**
 * Get process metrics on Unix using /proc or ps
 */
async function getUnixProcessMetrics(pid: number): Promise<ProcessMetrics> {
  const metrics: ProcessMetrics = {
    alive: false,
    memory_mb: null,
    cpu_percent: null,
    uptime_ms: null,
  };

  // Try using ps command which works on both Linux and macOS
  const psResult = await safeExec(
    `ps -o pid=,rss=,%cpu=,etime= -p ${pid}`,
    PROJECT_ROOT,
    5000
  );

  if (psResult.error || !psResult.stdout.trim()) {
    return metrics;
  }

  metrics.alive = true;

  // Parse ps output: PID RSS %CPU ELAPSED
  const parts = psResult.stdout.trim().split(/\s+/);
  if (parts.length >= 4) {
    // RSS is in KB
    const rssKB = parseInt(parts[1], 10);
    if (!isNaN(rssKB)) {
      metrics.memory_mb = Math.round(rssKB / 1024 * 100) / 100;
    }

    // CPU percentage
    const cpuPercent = parseFloat(parts[2]);
    if (!isNaN(cpuPercent)) {
      metrics.cpu_percent = Math.round(cpuPercent * 100) / 100;
    }

    // Elapsed time format: [[DD-]HH:]MM:SS
    const elapsed = parts[3];
    metrics.uptime_ms = parseElapsedTime(elapsed);
  }

  return metrics;
}

/**
 * Parse elapsed time string to milliseconds
 * Handles formats: SS, MM:SS, HH:MM:SS, DD-HH:MM:SS
 */
function parseElapsedTime(elapsed: string): number | null {
  if (!elapsed) return null;

  try {
    let days = 0;
    let timePart = elapsed;

    // Check for days format: DD-HH:MM:SS
    if (elapsed.includes('-')) {
      const [dayPart, rest] = elapsed.split('-');
      days = parseInt(dayPart, 10);
      timePart = rest;
    }

    const parts = timePart.split(':').reverse();
    let seconds = 0;

    if (parts[0]) seconds += parseInt(parts[0], 10);
    if (parts[1]) seconds += parseInt(parts[1], 10) * 60;
    if (parts[2]) seconds += parseInt(parts[2], 10) * 3600;
    seconds += days * 86400;

    return seconds * 1000;
  } catch {
    return null;
  }
}

/**
 * Get process metrics cross-platform
 */
async function getProcessMetrics(pid: number): Promise<ProcessMetrics> {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    return getWindowsProcessMetrics(pid);
  } else {
    return getUnixProcessMetrics(pid);
  }
}

/**
 * Perform HTTP health check
 */
async function performHealthCheck(url: string): Promise<HealthCheckResult> {
  const startTime = Date.now();

  return new Promise<HealthCheckResult>((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const timeout = 10000; // 10 second timeout

    const req = client.get(url, { timeout }, (res) => {
      const latency = Date.now() - startTime;
      const status = res.statusCode || 0;

      // Consume response data to free up memory
      res.resume();

      resolve({
        url,
        status,
        latency_ms: latency,
        ok: status >= 200 && status < 400,
      });
    });

    req.on('error', () => {
      resolve({
        url,
        status: 0,
        latency_ms: Date.now() - startTime,
        ok: false,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url,
        status: 0,
        latency_ms: timeout,
        ok: false,
      });
    });
  });
}

/**
 * Match patterns against text and collect events
 */
function matchPatterns(
  text: string,
  patterns: string[],
  existingEvents: MonitoringEvent[]
): MonitoringEvent[] {
  const events: MonitoringEvent[] = [];
  const timestamp = new Date().toISOString();

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        for (const match of matches.slice(0, 5)) { // Limit to 5 per pattern
          // Avoid duplicate messages
          const isDuplicate = existingEvents.some(e => e.message === match) ||
                             events.some(e => e.message === match);
          if (!isDuplicate) {
            events.push({ timestamp, message: match });
          }
        }
      }
    } catch {
      // Invalid regex pattern, skip
    }
  }

  return events;
}

/**
 * Determine health status based on metrics and checks
 */
function determineStatus(
  metrics: ProcessMetrics,
  healthCheck: HealthCheckResult | undefined,
  errorCount: number,
  warningCount: number
): 'healthy' | 'degraded' | 'unhealthy' | 'crashed' | 'not_found' {
  // Process not found
  if (!metrics.alive) {
    return 'not_found';
  }

  // Health check failed
  if (healthCheck && !healthCheck.ok) {
    return healthCheck.status === 0 ? 'crashed' : 'unhealthy';
  }

  // High error count indicates unhealthy
  if (errorCount >= 5) {
    return 'unhealthy';
  }

  // Some errors or high warnings indicates degraded
  if (errorCount > 0 || warningCount >= 5) {
    return 'degraded';
  }

  // High memory usage (over 2GB) may indicate degraded
  if (metrics.memory_mb && metrics.memory_mb > 2048) {
    return 'degraded';
  }

  // High CPU (over 90% sustained)
  if (metrics.cpu_percent && metrics.cpu_percent > 90) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handles the health_monitor MCP tool call.
 *
 * Monitors a running process for health status including:
 * - Process alive check
 * - Memory and CPU usage
 * - HTTP health endpoint checks
 * - Error pattern detection in output
 *
 * @param args - The health_monitor tool arguments
 * @param args.pid - Process ID to monitor
 * @param args.health_url - Optional HTTP health check URL
 * @param args.error_patterns - Regex patterns to flag as errors
 * @param args.sample_interval - Ms between checks (default: 5000)
 * @param args.duration - How long to monitor in ms (default: 0 = instant)
 * @returns MCP tool response with health status and metrics
 *
 * @example
 * handleHealthMonitor({ pid: 1234 });
 * // Returns: {
 * //   status: 'healthy',
 * //   pid: 1234,
 * //   alive: true,
 * //   uptime_ms: 123456,
 * //   memory_mb: 128.5,
 * //   cpu_percent: 2.5,
 * //   errors: [],
 * //   warnings: []
 * // }
 *
 * @example
 * handleHealthMonitor({ pid: 1234, health_url: 'http://localhost:3000/health' });
 * // Returns health check result in last_health_check field
 */
export async function handleHealthMonitor(args: HealthMonitorArgs) {
  const {
    pid,
    health_url,
    error_patterns = DEFAULT_ERROR_PATTERNS,
    sample_interval = 5000,
    duration = 0,
  } = args;

  // Validate PID
  if (!Number.isInteger(pid) || pid <= 0) {
    return success({
      status: 'not_found',
      pid,
      alive: false,
      uptime_ms: null,
      memory_mb: null,
      cpu_percent: null,
      errors: [{ timestamp: new Date().toISOString(), message: 'Invalid PID provided' }],
      warnings: [],
    } as HealthMonitorResult);
  }

  // Quick alive check first
  if (!isProcessAlive(pid)) {
    return success({
      status: 'not_found',
      pid,
      alive: false,
      uptime_ms: null,
      memory_mb: null,
      cpu_percent: null,
      errors: [],
      warnings: [],
    } as HealthMonitorResult);
  }

  const errors: MonitoringEvent[] = [];
  const warnings: MonitoringEvent[] = [];
  let lastHealthCheck: HealthCheckResult | undefined;
  let lastMetrics: ProcessMetrics = {
    alive: true,
    memory_mb: null,
    cpu_percent: null,
    uptime_ms: null,
  };

  // Calculate number of samples
  const numSamples = duration > 0 ? Math.ceil(duration / sample_interval) : 1;
  const startTime = Date.now();

  for (let i = 0; i < numSamples; i++) {
    // Get process metrics
    lastMetrics = await getProcessMetrics(pid);

    // Process died during monitoring
    if (!lastMetrics.alive) {
      return success({
        status: 'crashed',
        pid,
        alive: false,
        uptime_ms: lastMetrics.uptime_ms,
        memory_mb: lastMetrics.memory_mb,
        cpu_percent: lastMetrics.cpu_percent,
        errors: [...errors, { timestamp: new Date().toISOString(), message: 'Process terminated during monitoring' }],
        warnings,
        last_health_check: lastHealthCheck,
      } as HealthMonitorResult);
    }

    // Perform health check if URL provided
    if (health_url) {
      lastHealthCheck = await performHealthCheck(health_url);

      // Add errors/warnings based on health check
      if (!lastHealthCheck.ok) {
        errors.push({
          timestamp: new Date().toISOString(),
          message: `Health check failed: ${lastHealthCheck.url} returned ${lastHealthCheck.status}`,
        });
      } else if (lastHealthCheck.latency_ms > 5000) {
        warnings.push({
          timestamp: new Date().toISOString(),
          message: `Slow health check response: ${lastHealthCheck.latency_ms}ms`,
        });
      }
    }

    // Check memory usage warnings
    if (lastMetrics.memory_mb && lastMetrics.memory_mb > 1024) {
      const newWarnings = matchPatterns(
        `High memory usage: ${lastMetrics.memory_mb}MB`,
        ['High memory'],
        warnings
      );
      warnings.push(...newWarnings);
    }

    // Check CPU usage warnings
    if (lastMetrics.cpu_percent && lastMetrics.cpu_percent > 80) {
      const newWarnings = matchPatterns(
        `High CPU usage: ${lastMetrics.cpu_percent}%`,
        ['High CPU'],
        warnings
      );
      warnings.push(...newWarnings);
    }

    // Wait for next sample if not last iteration
    if (i < numSamples - 1) {
      const elapsed = Date.now() - startTime;
      const nextSampleTime = (i + 1) * sample_interval;
      const sleepTime = Math.max(0, nextSampleTime - elapsed);
      if (sleepTime > 0) {
        await sleep(sleepTime);
      }
    }
  }

  // Determine final status
  const status = determineStatus(lastMetrics, lastHealthCheck, errors.length, warnings.length);

  const result: HealthMonitorResult = {
    status,
    pid,
    alive: lastMetrics.alive,
    uptime_ms: lastMetrics.uptime_ms,
    memory_mb: lastMetrics.memory_mb,
    cpu_percent: lastMetrics.cpu_percent,
    errors: errors.slice(0, 20), // Limit to 20 errors
    warnings: warnings.slice(0, 20), // Limit to 20 warnings
  };

  if (lastHealthCheck) {
    result.last_health_check = lastHealthCheck;
  }

  return success(result);
}
