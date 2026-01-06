/**
 * Dev Server Monitor
 *
 * Detects and tracks development server processes (npm run dev, next dev, vite, etc.)
 * Monitors server output for errors and maintains server state across hook executions.
 * Enables automatic recovery suggestions when dev servers encounter runtime errors.
 *
 * @module post-tool-use/dev-server-monitor
 * @see {@link ../post-tool-use} for bash command processing
 */
import type { HooksState } from '../types/state.js';
/**
 * Checks if a command matches known dev server command patterns.
 * Recognizes npm/yarn/pnpm dev commands, next dev, vite, and node server patterns.
 *
 * @param command - The bash command string to check
 * @returns True if the command appears to be starting a dev server
 *
 * @example
 * isDevServerCommand('npm run dev');  // true
 * isDevServerCommand('vite --port 3000');  // true
 * isDevServerCommand('npm install');  // false
 */
export declare function isDevServerCommand(command: string): boolean;
/**
 * Registers a new dev server in the session state.
 * Tracks the server's command, port, start time, and error status.
 *
 * @param state - The current hooks session state to update
 * @param pid - Process identifier or unique string to identify the server
 * @param command - The command used to start the dev server
 * @param port - The port number the server is listening on
 *
 * @example
 * registerDevServer(state, 'bash_12345', 'npm run dev', 3000);
 */
export declare function registerDevServer(state: HooksState, pid: string, command: string, port: number): void;
/**
 * Removes a dev server from the session state.
 * Called when a dev server process is stopped or terminated.
 *
 * @param state - The current hooks session state to update
 * @param pid - Process identifier of the server to remove
 *
 * @example
 * unregisterDevServer(state, 'bash_12345');
 */
export declare function unregisterDevServer(state: HooksState, pid: string): void;
/**
 * Records an error from a dev server.
 * Updates the lastError field for the specified server if it exists.
 *
 * @param state - The current hooks session state to update
 * @param pid - Process identifier of the server that encountered the error
 * @param error - The error message to record
 *
 * @example
 * recordDevServerError(state, 'bash_12345', 'Module not found: ./missing');
 */
export declare function recordDevServerError(state: HooksState, pid: string, error: string): void;
/**
 * Parses dev server output for error messages.
 * Extracts error details from common error patterns (Error, TypeError, SyntaxError, etc.).
 *
 * @param output - The raw output string from a dev server or build process
 * @returns Array of extracted error message strings
 *
 * @example
 * const errors = parseDevServerErrors('Error: Cannot find module "foo"\nCompiled successfully');
 * // Returns: ['Cannot find module "foo"']
 */
export declare function parseDevServerErrors(output: string): string[];
