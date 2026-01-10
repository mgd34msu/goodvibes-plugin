/**
 * Security handlers
 *
 * Provides MCP tools for security analysis including:
 * - Secrets and credentials detection
 * - Permission and access pattern analysis
 * - Security vulnerability scanning
 *
 * @module handlers/security
 */

// Secrets scanning
export { handleScanForSecrets } from './secrets-scanner.js';
export type { ScanForSecretsArgs, SecretSeverity } from './secrets-scanner.js';

// Permission checking
export { handleCheckPermissions } from './permissions.js';
export type { CheckPermissionsArgs, PermissionType, RiskLevel } from './permissions.js';
