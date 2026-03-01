/**
 * Barrel export for the api extensions domain (L2).
 *
 * Re-exports all orchestration functions from the api extension layer.
 *
 * @module extensions/api
 */

export { getApiRoutes } from './routes.js';
export { generateOpenApi } from './spec.js';
export { validateApiContract } from './validate.js';
export { syncApiTypes } from './sync.js';
