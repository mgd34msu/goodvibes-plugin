/**
 * Project analysis handlers
 *
 * Exports handlers for project-level analysis tools including
 * environment configuration scanning, convention analysis,
 * and other project introspection.
 *
 * @module handlers/project
 */

export { handleGetEnvConfig } from './env-config.js';
export type { GetEnvConfigArgs } from './env-config.js';

export { handleGetConventions } from './conventions.js';
export type { GetConventionsArgs } from './conventions.js';
