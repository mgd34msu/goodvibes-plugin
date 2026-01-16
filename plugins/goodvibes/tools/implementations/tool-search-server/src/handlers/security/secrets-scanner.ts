/**
 * Secrets Scanner Handler
 *
 * Scans source files for potential secrets, credentials, and sensitive data
 * using regex patterns to detect common secret formats.
 *
 * @module handlers/security/secrets-scanner
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { safeExec, fileExists } from '../../utils.js';

/**
 * Severity levels for detected secrets
 */
export type SecretSeverity = 'low' | 'medium' | 'high';

/**
 * Arguments for scan_for_secrets tool
 */
export interface ScanForSecretsArgs {
  path?: string;
  include_staged?: boolean;
  severity_threshold?: SecretSeverity;
  /** Maximum directory depth to scan (default: 10, configurable via SECRETS_SCAN_MAX_DEPTH env var) */
  max_depth?: number;
  /** Stop scanning after first match if true - useful for presence checks (default: false) */
  check_presence_only?: boolean;
}

/**
 * A single secret finding
 */
interface SecretFinding {
  file: string;
  line: number;
  column: number;
  secret_type: string;
  severity: SecretSeverity;
  preview: string;
  recommendation: string;
}

/**
 * Secret pattern definition
 */
interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: SecretSeverity;
  recommendation: string;
}

/**
 * Secret patterns to detect
 *
 * Each pattern includes:
 * - name: Human-readable name for the secret type
 * - pattern: RegExp to match the secret (with 'g' flag for global matching)
 * - severity: How critical this secret exposure would be
 * - recommendation: How to fix the issue
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // AWS Keys (High severity)
  {
    name: 'aws_access_key',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    severity: 'high',
    recommendation: 'Use environment variables or AWS IAM roles instead of hardcoding AWS credentials. Store in .env file and add to .gitignore.',
  },
  {
    name: 'aws_secret_key',
    pattern: /\b([A-Za-z0-9/+=]{40})\b(?=.*(?:aws|secret|key))/gi,
    severity: 'high',
    recommendation: 'Use environment variables or AWS IAM roles. Never commit AWS secret keys to version control.',
  },

  // GitHub Tokens (High severity)
  {
    name: 'github_token',
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    recommendation: 'Use GITHUB_TOKEN environment variable or GitHub Actions secrets. Rotate the exposed token immediately.',
  },
  {
    name: 'github_oauth',
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    recommendation: 'Use environment variables for OAuth tokens. Revoke and regenerate the exposed token.',
  },
  {
    name: 'github_user_token',
    pattern: /\b(ghu_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    recommendation: 'Use environment variables for user tokens. Revoke and regenerate the exposed token.',
  },
  {
    name: 'github_server_token',
    pattern: /\b(ghs_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    recommendation: 'Use environment variables for server tokens. Revoke and regenerate the exposed token.',
  },
  {
    name: 'github_refresh_token',
    pattern: /\b(ghr_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    recommendation: 'Use environment variables for refresh tokens. Revoke and regenerate the exposed token.',
  },

  // Slack Tokens (High severity)
  {
    name: 'slack_token',
    pattern: /\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*)\b/g,
    severity: 'high',
    recommendation: 'Use environment variables for Slack tokens. Regenerate the token in Slack admin settings.',
  },
  {
    name: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
    severity: 'medium',
    recommendation: 'Use environment variables for webhook URLs. Consider regenerating the webhook if exposed.',
  },

  // Private Keys (High severity)
  {
    name: 'rsa_private_key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'high',
    recommendation: 'Never commit private keys. Use secure key management or environment variables for key paths.',
  },
  {
    name: 'openssh_private_key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'high',
    recommendation: 'Never commit SSH private keys. Generate new keys if exposed and update authorized_keys.',
  },
  {
    name: 'ec_private_key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'high',
    recommendation: 'Never commit EC private keys. Generate new keys if exposed.',
  },
  {
    name: 'pgp_private_key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'high',
    recommendation: 'Never commit PGP private keys. Revoke and regenerate if exposed.',
  },

  // Database Connection Strings (High severity)
  {
    name: 'database_url',
    pattern: /\b((?:mongodb|postgres|postgresql|mysql|redis|amqp):\/\/[^"\s]+:[^"\s]+@[^"\s]+)\b/gi,
    severity: 'high',
    recommendation: 'Use DATABASE_URL environment variable. Never hardcode database credentials.',
  },

  // JWT Tokens (Medium severity - may be test tokens)
  {
    name: 'jwt_token',
    pattern: /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]+\b/g,
    severity: 'medium',
    recommendation: 'Avoid committing JWT tokens. If this is a test token, consider using mock tokens in tests.',
  },

  // Generic API Keys (Medium severity)
  {
    name: 'generic_api_key',
    pattern: /\b(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    severity: 'medium',
    recommendation: 'Use environment variables for API keys. Add key names to .env.example without values.',
  },
  {
    name: 'generic_secret',
    pattern: /\b(?:secret|password|passwd|pwd)\s*[=:]\s*["']([^"'\s]{8,})["']/gi,
    severity: 'medium',
    recommendation: 'Use environment variables for secrets. Never hardcode passwords in source code.',
  },

  // Basic Auth in URLs (Medium severity)
  {
    name: 'basic_auth_url',
    pattern: /https?:\/\/[^:]+:[^@]+@[^\s"']+/gi,
    severity: 'medium',
    recommendation: 'Remove credentials from URLs. Use environment variables for authentication.',
  },

  // Bearer Tokens in Code (Medium severity)
  {
    name: 'bearer_token',
    pattern: /\bBearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    severity: 'medium',
    recommendation: 'Do not hardcode bearer tokens. Use environment variables or secure token storage.',
  },

  // Google API Keys (Medium severity)
  {
    name: 'google_api_key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: 'medium',
    recommendation: 'Use environment variables for Google API keys. Restrict key usage in Google Cloud Console.',
  },

  // Stripe Keys (High severity)
  {
    name: 'stripe_secret_key',
    pattern: /\bsk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'high',
    recommendation: 'Never commit Stripe secret keys. Use STRIPE_SECRET_KEY environment variable.',
  },
  {
    name: 'stripe_publishable_key',
    pattern: /\bpk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'low',
    recommendation: 'Consider using environment variables even for publishable keys for easier key rotation.',
  },

  // SendGrid API Key (High severity)
  {
    name: 'sendgrid_api_key',
    pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
    severity: 'high',
    recommendation: 'Use SENDGRID_API_KEY environment variable. Regenerate the key if exposed.',
  },

  // Twilio (High severity)
  {
    name: 'twilio_api_key',
    pattern: /\bSK[a-f0-9]{32}\b/g,
    severity: 'high',
    recommendation: 'Use environment variables for Twilio credentials. Rotate exposed keys.',
  },

  // npm tokens (High severity)
  {
    name: 'npm_token',
    pattern: /\b(npm_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    recommendation: 'Use NPM_TOKEN environment variable. Revoke and regenerate exposed tokens.',
  },

  // Hardcoded IP addresses with credentials (Low severity)
  {
    name: 'hardcoded_ip_credentials',
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:[^@\s]+@/g,
    severity: 'low',
    recommendation: 'Avoid hardcoding IP addresses with credentials. Use configuration files.',
  },
];

/**
 * Files and directories to skip during scanning
 */
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.nyc_output',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.svg',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
];

/**
 * File extensions to scan
 */
const SCANNABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml',
  '.env', '.env.local', '.env.development', '.env.production',
  '.sh', '.bash',
  '.py',
  '.rb',
  '.go',
  '.java',
  '.cs',
  '.php',
  '.config', '.conf', '.cfg',
  '.xml',
  '.properties',
  '.ini',
  '.toml',
];

/**
 * Redacts a secret value for safe display
 *
 * @param value - The secret value to redact
 * @param visibleChars - Number of characters to show at start
 * @returns Redacted string with asterisks
 *
 * @example
 * redactSecret('AKIAIOSFODNN7EXAMPLE') // Returns 'AKIA****************'
 * redactSecret('abc', 4) // Returns '***' (full redaction for short values)
 */
export function redactSecret(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }
  return value.substring(0, visibleChars) + '*'.repeat(Math.min(value.length - visibleChars, 20));
}

/**
 * Checks if a file should be scanned based on skip patterns
 *
 * @param filePath - Path to check
 * @returns true if file should be skipped
 */
function shouldSkip(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return SKIP_PATTERNS.some(pattern => {
    if (pattern.startsWith('*.')) {
      return normalizedPath.endsWith(pattern.substring(1));
    }
    return normalizedPath.includes(`/${pattern}/`) || normalizedPath.includes(`/${pattern}`);
  });
}

/**
 * Checks if a file has a scannable extension
 *
 * @param filePath - Path to check
 * @returns true if file should be scanned
 */
function isScannable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Always scan .env files regardless of extension
  if (basename.startsWith('.env')) {
    return true;
  }

  return SCANNABLE_EXTENSIONS.includes(ext);
}

/**
 * Get the default max depth from environment variable or use 10.
 *
 * Environment variable: SECRETS_SCAN_MAX_DEPTH
 * Default: 10
 * Minimum: 1
 * Maximum: 50
 */
function getDefaultMaxDepth(): number {
  const DEFAULT_DEPTH = 10;
  const MIN_DEPTH = 1;
  const MAX_DEPTH = 50;

  const envDepth = process.env.SECRETS_SCAN_MAX_DEPTH;
  if (envDepth) {
    const parsed = parseInt(envDepth, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, MIN_DEPTH), MAX_DEPTH);
    }
  }

  return DEFAULT_DEPTH;
}

/**
 * Recursively gets all files in a directory
 *
 * @param dirPath - Directory to scan
 * @param files - Accumulator for found files
 * @param currentDepth - Current recursion depth (0-indexed)
 * @param maxDepth - Maximum depth to recurse (default: 10)
 * @returns Array of file paths
 */
async function getFilesRecursively(
  dirPath: string,
  files: string[] = [],
  currentDepth: number = 0,
  maxDepth: number = getDefaultMaxDepth()
): Promise<string[]> {
  // Stop if we've reached the maximum depth
  if (currentDepth >= maxDepth) {
    return files;
  }

  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (shouldSkip(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await getFilesRecursively(fullPath, files, currentDepth + 1, maxDepth);
      } else if (entry.isFile() && isScannable(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch (error: unknown) {
    // Directory may not exist or be inaccessible - log for debugging
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[secrets-scanner] Could not read directory ${dirPath}: ${message}`);
  }

  return files;
}

/**
 * Gets staged files from git
 *
 * @param projectPath - Project root path
 * @returns Array of staged file paths
 */
async function getStagedFiles(projectPath: string): Promise<string[]> {
  const result = await safeExec('git diff --cached --name-only', projectPath, 5000);

  if (result.error || !result.stdout) {
    return [];
  }

  return result.stdout
    .split('\n')
    .filter(f => f.trim())
    .map(f => path.join(projectPath, f))
    .filter(f => isScannable(f) && !shouldSkip(f));
}

/**
 * Result type for scanFile that supports early exit
 */
interface ScanFileResult {
  findings: SecretFinding[];
  /** True if scanning was stopped early (early exit optimization) */
  stoppedEarly: boolean;
}

/**
 * Scans a single file for secrets
 *
 * @param filePath - Path to the file
 * @param projectRoot - Project root for relative paths
 * @param earlyExit - If true, stop after first match (for presence-only checks)
 * @returns Object with findings array and stoppedEarly flag
 */
async function scanFile(
  filePath: string,
  projectRoot: string,
  earlyExit: boolean = false
): Promise<ScanFileResult> {
  const findings: SecretFinding[] = [];

  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(projectRoot, filePath);

    for (const pattern of SECRET_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.pattern.lastIndex = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let match;

        // Reset for each line
        pattern.pattern.lastIndex = 0;

        while ((match = pattern.pattern.exec(line)) !== null) {
          const matchValue = match[1] || match[0];

          // Skip if this looks like a placeholder or example
          if (isLikelyPlaceholder(matchValue, line)) {
            continue;
          }

          findings.push({
            file: relativePath,
            line: lineNum + 1,
            column: match.index + 1,
            secret_type: pattern.name,
            severity: pattern.severity,
            preview: redactSecret(matchValue),
            recommendation: pattern.recommendation,
          });

          // Early exit optimization: stop after first real match
          if (earlyExit) {
            return { findings, stoppedEarly: true };
          }
        }
      }
    }
  } catch (error: unknown) {
    // File may be binary or inaccessible - log for debugging
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[secrets-scanner] Could not read file ${filePath}: ${message}`);
  }

  return { findings, stoppedEarly: false };
}

/**
 * Checks if a matched value is likely a placeholder or example
 *
 * @param value - The matched value
 * @param line - The full line of code
 * @returns true if this looks like a placeholder
 */
function isLikelyPlaceholder(value: string, line: string): boolean {
  const lowerValue = value.toLowerCase();
  const lowerLine = line.toLowerCase();

  // Common placeholder patterns
  const placeholders = [
    'your_',
    'your-',
    '<your',
    'xxx',
    'example',
    'placeholder',
    'change_me',
    'changeme',
    'insert_',
    'insert-',
    'todo',
    'fixme',
    'replace_',
    'replace-',
    'dummy',
    'fake',
    'test_key',
    'test-key',
    'sample',
    'demo',
  ];

  if (placeholders.some(p => lowerValue.includes(p))) {
    return true;
  }

  // Check if line contains comment indicators suggesting example
  const commentIndicators = [
    '// example',
    '// todo',
    '// replace',
    '/* example',
    '# example',
    '# todo',
    '// e.g.',
    '// eg:',
    'process.env.',
  ];

  if (commentIndicators.some(c => lowerLine.includes(c))) {
    return true;
  }

  // Check if it's in a .env.example file context
  if (lowerLine.includes('.env.example') || lowerLine.includes('.env.sample')) {
    return true;
  }

  return false;
}

/**
 * Filters findings by severity threshold
 *
 * @param findings - Array of findings
 * @param threshold - Minimum severity to include
 * @returns Filtered findings
 */
function filterBySeverity(findings: SecretFinding[], threshold: SecretSeverity): SecretFinding[] {
  const severityOrder: Record<SecretSeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  const minSeverity = severityOrder[threshold];
  return findings.filter(f => severityOrder[f.severity] >= minSeverity);
}

/**
 * Handles the scan_for_secrets MCP tool call.
 *
 * Scans source files for potential secrets, credentials, and sensitive data
 * using pattern matching. Supports scanning directories and git staged files.
 *
 * @param args - The scan_for_secrets tool arguments
 * @param args.path - Directory to scan (defaults to PROJECT_ROOT)
 * @param args.include_staged - Whether to include git staged files (default: true)
 * @param args.severity_threshold - Minimum severity to report (default: 'low')
 * @param args.max_depth - Maximum directory depth (default: 10, configurable via SECRETS_SCAN_MAX_DEPTH)
 * @param args.check_presence_only - Stop after first match for faster presence checks (default: false)
 * @returns MCP tool response with findings and summary
 *
 * @example
 * await handleScanForSecrets({});
 * // Returns: {
 * //   findings: [{ file: 'config.ts', line: 10, secret_type: 'aws_access_key', ... }],
 * //   count: 1,
 * //   by_severity: { high: 1, medium: 0, low: 0 }
 * // }
 *
 * @example
 * // Fast presence check - stops after first secret found
 * await handleScanForSecrets({ check_presence_only: true });
 * // Returns: { has_secrets: true, findings: [...first match only...], ... }
 */
export async function handleScanForSecrets(args: ScanForSecretsArgs): Promise<ToolResponse> {
  const scanPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const includeStagedFiles = args.include_staged !== false;
  const severityThreshold = args.severity_threshold || 'low';
  const maxDepth = args.max_depth ?? getDefaultMaxDepth();
  const checkPresenceOnly = args.check_presence_only === true;

  let allFindings: SecretFinding[] = [];
  const scannedFiles = new Set<string>();
  let stoppedEarly = false;

  // Check if scan path exists
  if (!await fileExists(scanPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Path does not exist: ${args.path || '.'}`,
          findings: [],
          count: 0,
          by_severity: { high: 0, medium: 0, low: 0 },
        }, null, 2),
      }],
      isError: true,
    };
  }

  // Get files to scan (with configurable depth)
  const stats = await fsPromises.stat(scanPath);
  let filesToScan: string[] = [];

  if (stats.isDirectory()) {
    filesToScan = await getFilesRecursively(scanPath, [], 0, maxDepth);
  } else if (stats.isFile()) {
    filesToScan = [scanPath];
  }

  // Add staged files if requested
  if (includeStagedFiles) {
    const stagedFiles = await getStagedFiles(PROJECT_ROOT);
    const allFiles = filesToScan.concat(stagedFiles);
    filesToScan = Array.from(new Set(allFiles));
  }

  // Scan all files (with early exit support for presence-only checks)
  for (const filePath of filesToScan) {
    // Defensive check: Skip if already scanned (Set deduplication above should prevent this,
    // but this guard prevents double-scanning if paths are ever added with different normalizations)
    /* istanbul ignore if -- @preserve Defensive code: Set deduplication prevents this */
    if (scannedFiles.has(filePath)) {
      continue;
    }
    scannedFiles.add(filePath);

    const result = await scanFile(filePath, PROJECT_ROOT, checkPresenceOnly);
    allFindings.push(...result.findings);

    // Early exit: stop scanning more files if we found a secret in presence-only mode
    if (checkPresenceOnly && result.stoppedEarly) {
      stoppedEarly = true;
      break;
    }
  }

  // Filter by severity threshold
  allFindings = filterBySeverity(allFindings, severityThreshold);

  // Sort by severity (high first), then by file, then by line
  allFindings.sort((a, b) => {
    const severityOrder: Record<SecretSeverity, number> = { high: 2, medium: 1, low: 0 };
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return a.line - b.line;
  });

  // Calculate summary
  const bySeverity = {
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
  };

  // Build response object
  const response: Record<string, unknown> = {
    findings: allFindings,
    count: allFindings.length,
    by_severity: bySeverity,
    files_scanned: scannedFiles.size,
    scan_path: path.relative(PROJECT_ROOT, scanPath) || '.',
    max_depth: maxDepth,
  };

  // Add presence-only mode specific fields
  if (checkPresenceOnly) {
    response.has_secrets = allFindings.length > 0;
    response.stopped_early = stoppedEarly;
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2),
    }],
  };
}
