/**
 * Project Issues Handler - Re-export facade
 *
 * This file maintains backwards compatibility by re-exporting from the
 * modularized issues/ directory. For new code, import from './issues/index.js'.
 */

export { handleProjectIssues } from './issues/index.js';
export type { ProjectIssuesArgs } from './issues/index.js';
