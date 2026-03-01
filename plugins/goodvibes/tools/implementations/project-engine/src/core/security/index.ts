/**
 * Security core module barrel
 *
 * Re-exports all public types, constants, and utilities from the
 * security core layer for use by extensions and handlers.
 *
 * @module core/security
 */

export type {
  SecretSeverity,
  ScanForSecretsArgs,
  PermissionType,
  RiskLevel,
  CheckPermissionsArgs,
  PermissionFinding,
  EnvAuditArgs,
  EnvUsage,
  EnvVariable,
  MissingVariable,
  UnusedVariable,
  UndocumentedVariable,
  TypeIssue,
  EnvAuditSummary,
  EnvAuditResult,
} from './types.js';

export {
  SECURITY_SKIP_PATTERNS,
  SCANNABLE_EXTENSIONS,
  SOURCE_CODE_EXTENSIONS,
  SCAN_EXTENSIONS,
  SKIP_DIRS,
  ENV_PATTERNS,
  DEFAULT_PATTERNS,
  BUILTIN_VARS,
  getDefaultMaxDepth,
} from './constants.js';

export { shouldSkip, isScannable, isSourceFile } from './file-utils.js';
export { redactSecret } from './redaction.js';
export type { SecretFinding, SecretPattern } from './detection.js';
export { SECRET_PATTERNS, isLikelyPlaceholder, filterBySeverity } from './detection.js';
export { calculateRiskAssessment, generateRecommendations } from './risk.js';
export type { EnvVarData } from './env-parser.js';
export {
  parseEnvFile,
  scanFileForEnvVars,
  scanDirectoryForEnv,
  inferExpectedType,
  validateEnvValue,
} from './env-parser.js';
export { formatEnvAudit } from './formatters.js';
