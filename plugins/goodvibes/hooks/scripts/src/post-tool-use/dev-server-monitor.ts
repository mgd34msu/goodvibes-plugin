import type { HooksState } from '../types/state.js';

/** Patterns to identify dev server commands */
const DEV_SERVER_PATTERNS = [
  /npm run dev/,
  /npm start/,
  /yarn dev/,
  /pnpm dev/,
  /next dev/,
  /vite/,
  /node.*server/,
];

/** Checks if a command is a dev server command */
export function isDevServerCommand(command: string): boolean {
  return DEV_SERVER_PATTERNS.some(p => p.test(command));
}

/** Registers a new dev server in the session state */
export function registerDevServer(
  state: HooksState,
  pid: string,
  command: string,
  port: number
): void {
  state.devServers[pid] = {
    command,
    port,
    startedAt: new Date().toISOString(),
    lastError: null,
  };
}

/** Removes a dev server from the session state */
export function unregisterDevServer(state: HooksState, pid: string): void {
  delete state.devServers[pid];
}

/** Records an error from a dev server */
export function recordDevServerError(state: HooksState, pid: string, error: string): void {
  if (state.devServers[pid]) {
    state.devServers[pid].lastError = error;
  }
}

/** Patterns to extract error messages from dev server output */
const ERROR_PATTERNS = [
  /Error: (.+)/,
  /Unhandled Runtime Error: (.+)/,
  /TypeError: (.+)/,
  /ReferenceError: (.+)/,
  /SyntaxError: (.+)/,
  /Module not found: (.+)/,
];

/** Parses dev server output for error messages */
export function parseDevServerErrors(output: string): string[] {
  const errors: string[] = [];

  for (const pattern of ERROR_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, 'g'));
    for (const match of matches) {
      if (match[1]) {
        errors.push(match[1]);
      }
    }
  }

  return errors;
}
