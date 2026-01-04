import type { HooksState } from '../types/state.js';
/** Checks if a command is a dev server command */
export declare function isDevServerCommand(command: string): boolean;
/** Registers a new dev server in the session state */
export declare function registerDevServer(state: HooksState, pid: string, command: string, port: number): void;
/** Removes a dev server from the session state */
export declare function unregisterDevServer(state: HooksState, pid: string): void;
/** Records an error from a dev server */
export declare function recordDevServerError(state: HooksState, pid: string, error: string): void;
/** Parses dev server output for error messages */
export declare function parseDevServerErrors(output: string): string[];
