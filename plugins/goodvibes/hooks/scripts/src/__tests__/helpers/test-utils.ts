/**
 * Shared Test Utilities
 *
 * Provides consistent mocking helpers for tests, particularly for child_process
 * async exec operations and common dependencies.
 */

import { vi } from 'vitest';

import type { Mock } from 'vitest';

/**
 * Type for async exec function returned by promisify(exec)
 */
export type ExecAsyncFn = (
  _command: string,
  options?: {
    cwd?: string;
    encoding?: BufferEncoding;
    timeout?: number;
    maxBuffer?: number;
  }
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Creates a mock for child_process exec that works with promisify.
 * This is the correct mock for async operations using execAsync = promisify(exec).
 *
 * @param mockImplementation - Optional function to provide custom exec behavior
 * @returns A mock exec function that works with promisify
 *
 * @example
 * ```ts
 * vi.doMock('child_process', () => ({
 *   exec: createExecMock((cmd, opts, callback) => {
 *     callback(null, 'success', '');
 *   }),
 * }));
 * ```
 */
export function createExecMock(
  mockImplementation?: (
    _command: string,
    _options: object,
    _callback: (_error: Error | null, _stdout: string, _stderr: string) => void
  ) => void
): Mock {
  return vi.fn((command: string, options: object, callback: (_error: Error | null, _stdout: string, _stderr: string) => void) => {
    if (mockImplementation) {
      mockImplementation(command, options, callback);
    } else {
      // Default: success with empty output
      callback(null, '', '');
    }
  });
}

/**
 * Creates a mock that returns successful execution with given output.
 *
 * @param stdout - The stdout to return on success
 * @param stderr - The stderr to return (defaults to empty string)
 * @returns A mock exec function
 *
 * @example
 * ```ts
 * vi.doMock('child_process', () => ({
 *   exec: createSuccessExecMock('Build successful'),
 * }));
 * ```
 */
export function createSuccessExecMock(
  stdout: string = '',
  stderr: string = ''
): Mock {
  return createExecMock((command, options, callback) => {
    callback(null, stdout, stderr);
  });
}

/**
 * Creates a mock that returns a failed execution with error.
 *
 * @param errorMessage - The error message
 * @param stdout - Optional stdout from the failed command
 * @param stderr - Optional stderr from the failed command
 * @returns A mock exec function
 *
 * @example
 * ```ts
 * vi.doMock('child_process', () => ({
 *   exec: createFailureExecMock('Build failed', '', 'TypeScript errors'),
 * }));
 * ```
 */
export function createFailureExecMock(
  errorMessage: string,
  stdout: string = '',
  stderr: string = ''
): Mock {
  return createExecMock((command, options, callback) => {
    const error = new Error(errorMessage) as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    error.code = 1;
    error.stdout = stdout;
    error.stderr = stderr;
    callback(error, stdout, stderr);
  });
}

/**
 * Creates a mock child_process module for successful operations.
 *
 * @param stdout - Output to return
 * @param stderr - Error output to return
 * @returns A complete child_process module mock
 *
 * @example
 * ```ts
 * vi.doMock('child_process', () => createChildProcessMock('success'));
 * ```
 */
export function createChildProcessMock(
  stdout: string = '',
  stderr: string = ''
) {
  return {
    exec: createSuccessExecMock(stdout, stderr),
    execSync: vi.fn().mockReturnValue(Buffer.from(stdout)),
  };
}

/**
 * Creates a mock child_process module for failed operations.
 *
 * @param errorMessage - The error message
 * @param stdout - Optional stdout from failed command
 * @param stderr - Optional stderr from failed command
 * @returns A complete child_process module mock
 *
 * @example
 * ```ts
 * vi.doMock('child_process', () =>
 *   createChildProcessFailureMock('Build failed', '', 'TS errors')
 * );
 * ```
 */
export function createChildProcessFailureMock(
  errorMessage: string,
  stdout: string = '',
  stderr: string = ''
) {
  return {
    exec: createFailureExecMock(errorMessage, stdout, stderr),
    execSync: vi.fn().mockImplementation(() => {
      const error = new Error(errorMessage) as Error & {
        stdout?: Buffer;
        stderr?: Buffer;
      };
      error.stdout = Buffer.from(stdout);
      error.stderr = Buffer.from(stderr);
      throw error;
    }),
  };
}

/**
 * Creates a mock for fs.existsSync with configurable file existence.
 *
 * @param existingPaths - Array of paths or a predicate function to determine if path exists
 * @returns A mock existsSync function
 *
 * @example
 * ```ts
 * vi.doMock('fs', () => ({
 *   existsSync: createExistsSyncMock(['package.json', 'next.config.js']),
 * }));
 * ```
 */
export function createExistsSyncMock(
  existingPaths: string[] | ((_path: string) => boolean)
): Mock {
  if (typeof existingPaths === 'function') {
    return vi.fn().mockImplementation(existingPaths);
  }
  return vi.fn().mockImplementation((path: string) =>
    existingPaths.some((p) => path.includes(p))
  );
}

/**
 * Creates a mock for shared/index.js fileExists function.
 *
 * @param existingPaths - Array of paths or a predicate function
 * @returns A mock shared module
 *
 * @example
 * ```ts
 * vi.doMock('../../shared/index.js', () =>
 *   createSharedMock({ fileExists: ['next.config.js'] })
 * );
 * ```
 */
export function createSharedMock(options: {
  fileExists?: string[] | ((_path: string) => boolean);
  extractErrorOutput?: string | ((_error: Error) => string);
} = {}) {
  const fileExistsMock =
    typeof options.fileExists === 'function'
      ? vi.fn().mockImplementation(options.fileExists)
      : typeof options.fileExists === 'object'
        ? vi.fn().mockImplementation((path: string) =>
            Promise.resolve(
              options.fileExists!.some((p: string) => path.includes(p))
            )
          )
        : vi.fn().mockResolvedValue(false);

  const extractErrorOutputMock =
    typeof options.extractErrorOutput === 'function'
      ? vi.fn().mockImplementation(options.extractErrorOutput)
      : vi.fn().mockReturnValue(options.extractErrorOutput || '');

  return {
    fileExists: fileExistsMock,
    extractErrorOutput: extractErrorOutputMock,
  };
}

/**
 * Helper to import a module after mocking its dependencies.
 * Automatically resets modules before import to ensure fresh state.
 *
 * @param modulePath - The path to the module to import
 * @returns The imported module
 *
 * @example
 * ```ts
 * vi.doMock('child_process', () => createChildProcessMock());
 * const { runBuild } = await importFresh('../../automation/build-runner.js');
 * ```
 */
export async function importFresh<T = unknown>(modulePath: string): Promise<T> {
  vi.resetModules();
  return import(modulePath);
}

// Re-export vi for convenience
export { vi };
