/**
 * Process handlers
 *
 * Provides MCP tools for process management including:
 * - Development server lifecycle management
 * - Process spawning and monitoring
 *
 * @module handlers/process
 */

// Dev server management
export {
  handleStartDevServer,
  getSpawnedProcesses,
  killProcess,
  killAllProcesses,
} from './start-dev-server.js';
export type {
  StartDevServerArgs,
  StartDevServerResult,
  ServerStatus,
} from './start-dev-server.js';

// Health monitoring
export { handleHealthMonitor } from './health-monitor.js';
export type { HealthMonitorArgs } from './health-monitor.js';

// Error watching
export { handleWatchForErrors } from './watch-for-errors.js';
export type {
  WatchForErrorsArgs,
  WatchForErrorsResult,
  DetectedError,
  DetectedWarning,
  SourceInfo,
  ErrorType,
} from './watch-for-errors.js';
