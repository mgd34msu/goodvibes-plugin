/**
 * Endpoint matching and fix suggestion utilities for the api domain.
 *
 * Provides functions for normalizing endpoint paths and matching frontend
 * calls to backend routes for type drift detection.
 *
 * @module core/api/matching
 */

import type { TypeDrift, BackendRoute } from './types.js';

/**
 * Normalize an API endpoint path for consistent comparison.
 *
 * - Ensures leading slash
 * - Removes query string
 * - Replaces template literal expressions with `[param]`
 * - Normalizes consecutive slashes
 * - Removes trailing slash (except root)
 *
 * @param endpoint - Raw endpoint string from frontend code
 * @returns Normalized endpoint path
 *
 * @example
 * ```typescript
 * normalizeEndpoint('api/users?page=1'); // '/api/users'
 * normalizeEndpoint('/api/users/${id}'); // '/api/users/[param]'
 * ```
 */
export function normalizeEndpoint(endpoint: string): string {
  // Remove leading slash if present
  let normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;

  // Remove query string
  const queryIndex = normalized.indexOf('?');
  if (queryIndex !== -1) {
    normalized = normalized.substring(0, queryIndex);
  }

  // Remove template literals ${...} and replace with [param]
  normalized = normalized.replace(/\$\{[^}]+\}/g, '[param]');

  // Normalize consecutive slashes
  normalized = normalized.replace(/\/+/g, '/');

  // Remove trailing slash
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Match a normalized frontend call endpoint to a backend route path.
 *
 * Supports direct equality and pattern matching for dynamic route segments
 * (`[param]` for single segments, `[...slug]` for catch-all segments).
 *
 * @param callEndpoint - Normalized frontend endpoint path
 * @param routePath - Backend route path pattern
 * @returns True if the frontend endpoint matches the backend route
 *
 * @example
 * ```typescript
 * matchEndpoint('/api/users/[param]', '/api/users/[id]'); // true
 * matchEndpoint('/api/posts', '/api/users/[id]'); // false
 * ```
 */
export function matchEndpoint(callEndpoint: string, routePath: string): boolean {
  // Direct match
  if (callEndpoint === routePath) {
    return true;
  }

  // Convert route path pattern to regex
  const routePattern = routePath
    .replace(/\[\.\.\.([\w]+)\]/g, '.+') // catch-all
    .replace(/\[(\w+)\]/g, '[^/]+'); // dynamic segment

  const regex = new RegExp(`^${routePattern}$`);
  return regex.test(callEndpoint);
}

/**
 * Generate a human-readable fix suggestion for a detected type drift.
 *
 * Returns actionable text based on the drift issue type, helping developers
 * understand how to resolve the mismatch.
 *
 * @param drift - The type drift entry describing the issue
 * @param backendRoute - The matching backend route (may be undefined for endpoint_not_found)
 * @returns A fix suggestion string, or undefined if no suggestion can be generated
 */
export function generateFixSuggestion(
  drift: TypeDrift,
  backendRoute: BackendRoute | undefined
): string | undefined {
  if (!backendRoute && drift.issue !== 'endpoint_not_found') {
    return undefined;
  }

  switch (drift.issue) {
    case 'missing_type':
      if (drift.backend_type) {
        return `Add type annotation to frontend call:\n` +
          `  // Import the type from backend\n` +
          `  import type { ${drift.backend_type} } from '@/types';\n\n` +
          `  // Add generic parameter to fetch call\n` +
          `  const response = await fetch<${drift.backend_type}>('${drift.endpoint}');`;
      }
      return `Add type annotations to both backend handler and frontend call.`;

    case 'type_mismatch':
      return `Align types between backend and frontend:\n` +
        `  Backend returns: ${drift.backend_type}\n` +
        `  Frontend expects: ${drift.frontend_type}\n\n` +
        `  Consider creating a shared type definition in a common module.`;

    case 'endpoint_not_found':
      return `The endpoint '${drift.endpoint}' called in frontend doesn't match any backend route.\n` +
        `  Check for typos or missing route handler.`;

    default:
      return undefined;
  }
}
