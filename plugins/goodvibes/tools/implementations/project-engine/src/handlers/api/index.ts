/**
 * API domain handlers.
 *
 * Provides 4 tools for API analysis and management:
 * - project_api_routes: Detect and list API route definitions
 * - project_api_spec: Generate OpenAPI specification from code
 * - project_api_validate: Validate API contract compliance
 * - project_api_sync: Synchronize API types between client and server
 */

export { handleGetApiRoutes } from './routes.js';
export { handleGenerateOpenApi } from './spec.js';
export { handleValidateApiContract } from './validate.js';
export { handleSyncApiTypes } from './sync.js';
