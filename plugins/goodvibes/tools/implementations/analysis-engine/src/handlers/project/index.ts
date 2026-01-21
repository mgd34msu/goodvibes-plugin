/**
 * Project analysis handlers
 *
 * Exports handlers for project-level analysis tools including
 * convention analysis and other project introspection.
 *
 * @module handlers/project
 */

export { handleGetConventions } from './conventions.js';
export type { GetConventionsArgs } from './conventions.js';

export { handleGetEnvConfig } from './env-config.js';
export type { GetEnvConfigArgs } from './env-config.js';
