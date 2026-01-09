/**
 * Spawn Utilities
 *
 * Safe process spawning utilities to avoid shell injection vulnerabilities.
 */

import { spawn } from 'child_process';

/**
 * Promisified spawn that returns a promise resolving to exit code.
 * Used for commands where we need to pass arguments as an array to avoid shell injection.
 *
 * @param command - The command to execute
 * @param args - Array of arguments to pass to the command
 * @param options - Execution options including working directory and optional timeout
 * @returns Promise resolving to an object with exit code, stdout, and stderr
 */
export function spawnAsync(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = options.timeout
      ? setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            code: null,
            stdout,
            stderr: stderr + '\nProcess timed out',
          });
        }, options.timeout)
      : /* v8 ignore next -- @preserve defensive: all exported functions always provide timeout */ null;

    child.on('close', (code) => {
      /* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      /* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ code: null, stdout, stderr: err.message });
    });
  });
}

/**
 * Sanitizes a string for safe use in git commands.
 * Removes shell metacharacters that could enable command injection.
 *
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in git commands
 */
export function sanitizeForGit(input: string): string {
  // Remove or escape shell metacharacters
  return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, '');
}
