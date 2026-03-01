/**
 * Security domain type definitions
 *
 * Shared types across all security tools: secrets scanner,
 * permissions checker, and environment variable auditor.
 *
 * @module core/security/types
 */

// =============================================================================
// Secrets Scanner Types
// =============================================================================

/**
 * Severity levels for detected secrets.
 */
export type SecretSeverity = 'low' | 'medium' | 'high';

/**
 * Arguments for the scan_for_secrets tool.
 */
export interface ScanForSecretsArgs {
  /** Directory or file path to scan (defaults to project root) */
  path?: string;
  /** Whether to include git staged files in the scan (default: true) */
  include_staged?: boolean;
  /** Minimum severity level to include in results (default: 'low') */
  severity_threshold?: SecretSeverity;
  /** Maximum directory depth to scan (default: 10, configurable via SECRETS_SCAN_MAX_DEPTH) */
  max_depth?: number;
  /** Stop scanning after first match — useful for presence checks (default: false) */
  check_presence_only?: boolean;
}

// =============================================================================
// Permissions Checker Types
// =============================================================================

/**
 * Categories of permission-sensitive API usage.
 */
export type PermissionType = 'filesystem' | 'network' | 'process' | 'crypto';

/**
 * Risk levels for permission findings.
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Arguments for the check_permissions MCP tool.
 */
export interface CheckPermissionsArgs {
  /** Specific file to analyze */
  file?: string;
  /** Directory to scan (defaults to project root) */
  path?: string;
}

/**
 * A single permission finding from static analysis.
 */
export interface PermissionFinding {
  /** Category of permission being used */
  type: PermissionType;
  /** API name that was matched */
  api: string;
  /** Relative file path where the usage was found */
  file: string;
  /** Line number of the usage */
  line: number;
  /** Risk classification for this API usage */
  risk_level: RiskLevel;
  /** Human-readable description of the finding */
  description: string;
}

// =============================================================================
// Environment Audit Types
// =============================================================================

/**
 * Arguments for the env_audit MCP tool.
 */
export interface EnvAuditArgs {
  /** Project root path to analyze (defaults to PROJECT_ROOT) */
  path?: string;
  /** Path to the .env file (default: ".env") */
  env_file?: string;
  /** Path to the .env.example file (default: ".env.example") */
  example_file?: string;
  /** Variable names to ignore during validation */
  ignore?: string[];
  /** Validate value formats based on variable naming (e.g., PORT should be numeric) */
  check_values?: boolean;
  /** Scan source code for env var usages (default: true) */
  scan_code?: boolean;
}
