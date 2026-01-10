/**
 * Security handlers
 *
 * Provides MCP tools for security analysis including:
 * - Secrets and credentials detection
 * - Security vulnerability scanning
 *
 * @module handlers/security
 */

export { handleScanForSecrets } from './secrets-scanner.js';
export type { ScanForSecretsArgs, SecretSeverity } from './secrets-scanner.js';
