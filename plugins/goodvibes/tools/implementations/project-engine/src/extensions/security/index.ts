/**
 * Security extensions barrel
 *
 * Re-exports all security MCP tool handlers.
 *
 * @module extensions/security
 */

export { scanForSecrets } from './secrets.js';
export { checkPermissions } from './permissions.js';
export { auditEnvVars } from './env-audit.js';
