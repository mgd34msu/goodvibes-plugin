/**
 * Process management utilities for the runtime domain.
 *
 * Provides cross-platform functions for checking process liveness,
 * reading process memory, and spawning commands.
 *
 * @module core/runtime/process-utils
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';

/**
 * Checks if a process is still alive by sending signal 0.
 *
 * Signal 0 does not kill the process but will throw if the process
 * does not exist or permission is denied.
 *
 * @param pid - Process ID to check
 * @returns True if the process exists and is accessible
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets RSS memory usage for a process on Windows.
 *
 * Uses `tasklist /FO CSV` to read the working set in KB.
 *
 * @param pid - Process ID to measure
 * @returns Object with `rss_mb`, or null if measurement fails
 */
export function getWindowsMemory(pid: number): { rss_mb: number } | null {
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
 * Gets RSS memory usage for a process on Unix/macOS.
 *
 * Uses `ps -o rss= -p <pid>` to read the RSS in KB.
 *
 * @param pid - Process ID to measure
 * @returns Object with `rss_mb`, or null if measurement fails
 */
export function getUnixMemory(pid: number): { rss_mb: number } | null {
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
 * Gets memory usage for a process in a cross-platform manner.
 *
 * Delegates to `getWindowsMemory` on Windows, `getUnixMemory` elsewhere.
 *
 * @param pid - Process ID to measure
 * @returns Object with `rss_mb`, or null if measurement fails
 */
export function getProcessMemory(pid: number): { rss_mb: number } | null {
  const isWindows = process.platform === 'win32';
  return isWindows ? getWindowsMemory(pid) : getUnixMemory(pid);
}

/**
 * Spawns a shell command as a child process.
 *
 * Uses `/bin/sh -c <command>` on Unix and the Windows shell otherwise.
 * The process is detached on Unix to allow monitoring the full process tree.
 *
 * @param command - Shell command string to execute
 * @param cwd - Working directory for the command
 * @returns The spawned ChildProcess
 */
export function spawnCommand(command: string, cwd: string): ChildProcess {
  const isWindows = process.platform === 'win32';
  const args = isWindows ? [] : ['-c', command];
  const cmd = isWindows ? command : '/bin/sh';

  return spawn(cmd, args, {
    cwd,
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
  });
}
