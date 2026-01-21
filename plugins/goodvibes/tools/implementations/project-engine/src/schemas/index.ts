/**
 * Schema aggregator for project-engine MCP server.
 *
 * Combines all schema modules into a single export for the server.
 */

import { PROJECT_SCHEMAS } from './project-schemas.js';
import { TEST_SCHEMAS } from './test-schemas.js';
import { TYPES_SCHEMAS } from './types-schemas.js';
import { GIT_SCHEMAS } from './git-schemas.js';
import { BUILD_SCHEMAS } from './build-schemas.js';
import { DEPS_SCHEMAS } from './deps-schemas.js';

/**
 * All tool schemas provided by project-engine.
 */
export const allSchemas = [
  ...PROJECT_SCHEMAS,
  ...TEST_SCHEMAS,
  ...TYPES_SCHEMAS,
  ...GIT_SCHEMAS,
  ...BUILD_SCHEMAS,
  ...DEPS_SCHEMAS,
];

// Re-export individual schema groups
export {
  PROJECT_SCHEMAS,
  TEST_SCHEMAS,
  TYPES_SCHEMAS,
  GIT_SCHEMAS,
  BUILD_SCHEMAS,
  DEPS_SCHEMAS,
};
