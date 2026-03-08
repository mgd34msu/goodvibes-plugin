/**
 * IPC Extension — Barrel Export
 */
export { createIPCSubsystem } from './setup.js';
export type { CreateIPCOptions } from './setup.js';
export { IPCRouter } from './ipc-router.js';
export type { IPCRouterDeps } from './ipc-router.js';
export { teardownIPC, removeSocketPointerFile } from './teardown.js';
export type { IPCSubsystem } from './teardown.js';
export { performStateCleanup } from './state-cleanup.js';
export type { CleanupOptions, CleanupResult } from './state-cleanup.js';
export { SocketWatcher } from './socket-watcher.js';
export type { SocketWatcherOptions } from './socket-watcher.js';
