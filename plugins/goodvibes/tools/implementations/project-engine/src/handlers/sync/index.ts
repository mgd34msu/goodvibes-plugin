/**
 * Sync handlers
 *
 * Provides tools for detecting synchronization issues between different
 * parts of the codebase:
 * - sync_api_types: Detect type drift between backend API routes and frontend calls
 *
 * @module handlers/sync
 */

// API Type Sync
export { handleSyncApiTypes } from './sync-api-types.js';
export type {
  SyncApiTypesArgs,
  SyncApiTypesResult,
  BackendRoute,
  FrontendCall,
  TypeDrift,
  SyncSummary,
} from './sync-api-types.js';
