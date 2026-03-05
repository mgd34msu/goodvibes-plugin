/**
 * Shared daemon file naming constants.
 * Centralises paths used by daemon.ts, daemon-lifecycle.ts, and factory.ts.
 */

/** Name of the PID file written by the daemon process. */
export const DAEMON_PID_FILE = 'goodvibes-runtime.pid';

/** Name of the socket pointer file written by the daemon process. */
export const DAEMON_SOCKET_POINTER = 'daemon.socket';

/** Default Unix socket file name used by the daemon server. */
export const DAEMON_SOCKET_NAME = 'goodvibes-runtime.sock';

/** Default Unix socket file name used by the daemon hook server. */
export const DAEMON_HOOK_SOCKET_NAME = 'goodvibes-hook.sock';

/** Name of the lock file used to serialize concurrent daemon start attempts. */
export const DAEMON_LOCK_FILE = 'daemon.lock';

/** Relative path (from the runtime-engine package root) to the compiled daemon entry. */
export const DAEMON_ENTRY = 'dist/daemon.cjs';
