/**
 * Shared process-level utilities for the IPC subsystem.
 */

/**
 * Check if a process is alive by sending signal 0.
 *
 * Returns true when the process exists (even if the current user lacks
 * permission to signal it — EPERM means the OS confirmed the PID is present).
 * Returns false only when the process does not exist (ESRCH).
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EPERM') {
      return true;
    }
    return false;
  }
}
