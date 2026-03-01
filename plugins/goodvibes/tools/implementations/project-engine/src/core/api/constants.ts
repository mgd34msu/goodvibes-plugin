/**
 * Domain constants for the api domain.
 *
 * @module core/api/constants
 */

/**
 * Common API paths to search for backend routes.
 * Ordered by priority (most common conventions first).
 */
export const BACKEND_PATHS: readonly string[] = [
  'src/app/api',
  'app/api',
  'src/pages/api',
  'pages/api',
  'src/routes',
  'src/api',
  'api',
] as const;
