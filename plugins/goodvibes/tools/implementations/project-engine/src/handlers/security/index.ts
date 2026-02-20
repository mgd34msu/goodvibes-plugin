/**
 * Security domain handlers.
 *
 * Provides 3 tools for security analysis:
 * - project_security_secrets: Detect secrets and credentials in code
 * - project_security_permissions: Analyze file/network/system access patterns
 * - project_security_env: Comprehensive environment variable audit
 */

export { handleScanForSecrets } from './secrets.js';
export { handleCheckPermissions } from './permissions.js';
export { handleEnvAudit } from './env-audit.js';
