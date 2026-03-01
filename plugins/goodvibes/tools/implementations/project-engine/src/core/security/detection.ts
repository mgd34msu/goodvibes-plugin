/**
 * Secret detection utilities
 *
 * Regex pattern definitions for detecting secrets, plus filtering
 * and placeholder-detection helpers.
 *
 * @module core/security/detection
 */

import type { SecretSeverity } from './types.js';

// =============================================================================
// Secret Pattern Types
// =============================================================================

/**
 * A single secret finding within a scanned file.
 */
export interface SecretFinding {
  /** Relative file path where the secret was found */
  file: string;
  /** 1-indexed line number of the finding */
  line: number;
  /** 1-indexed column number of the finding */
  column: number;
  /** Human-readable name of the secret type */
  secret_type: string;
  /** Severity level */
  severity: SecretSeverity;
  /** Redacted preview of the matched value */
  preview: string;
  /** Recommendation for remediation */
  recommendation: string;
}

/**
 * Secret pattern definition used by the scanner.
 */
export interface SecretPattern {
  /** Human-readable name for the secret type */
  name: string;
  /** Global regex to match the secret */
  pattern: RegExp;
  /** Severity of this secret type */
  severity: SecretSeverity;
  /** Remediation recommendation */
  recommendation: string;
}

// =============================================================================
// Secret Patterns
// =============================================================================

/**
 * Known secret patterns with associated severity and remediation guidance.
 *
 * IMPORTANT: These strings are DETECTION PATTERNS used for scanning, NOT actual secrets.
 * They intentionally match private key headers and token formats in scanned code files.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS Keys (High severity)
  {
    name: 'aws_access_key',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    severity: 'high',
    recommendation: 'Use environment variables or AWS IAM roles instead of hardcoding AWS credentials. Store in .env file and add to .gitignore.',
  },
  {
    name: 'aws_secret_key',
    // Require assignment context (=/:/ space) to reduce false positives on arbitrary 40-char strings.
    // Pattern requires both upper and lower case letters plus the 40-char length to reduce false
    // positives from base64-encoded blobs or other 40-char strings that aren't AWS secrets.
    // Note: this pattern still has a low false positive rate for strings that happen to match;
    // isLikelyPlaceholder() handles common test/example values.
    pattern: /(?:=|:|\s)["']?([A-Za-z0-9/+=]{40})["']?(?=.*(?:aws|secret|key))/gi,
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

  // JWT Tokens (Medium severity)
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

  // Bearer Tokens (Medium severity)
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

  // Stripe Keys
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

  // SendGrid (High severity)
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

  // Hardcoded IP with credentials (Low severity)
  {
    name: 'hardcoded_ip_credentials',
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:[^@\s]+@/g,
    severity: 'low',
    recommendation: 'Avoid hardcoding IP addresses with credentials. Use configuration files.',
  },
];

// =============================================================================
// Detection Helpers
// =============================================================================

/**
 * Checks if a matched value is likely a placeholder or example.
 *
 * Detects common placeholder patterns (your_, xxx, example, etc.) and
 * comment indicators suggesting example code.
 *
 * @param value - The matched secret value
 * @param line - The full line of code containing the match
 * @returns true if this looks like a placeholder and should be skipped
 *
 * @example
 * isLikelyPlaceholder('your_api_key_here', '') // true
 * isLikelyPlaceholder('AKIA1234567890ABCDEF', 'const key = ...') // false
 */
export function isLikelyPlaceholder(value: string, line: string): boolean {
  const lowerValue = value.toLowerCase();
  const lowerLine = line.toLowerCase();

  const placeholders = [
    'your_', 'your-', '<your', 'xxx', 'example', 'placeholder',
    'change_me', 'changeme', 'insert_', 'insert-', 'todo', 'fixme',
    'replace_', 'replace-', 'dummy', 'fake', 'test_key', 'test-key',
    'sample', 'demo',
  ];

  if (placeholders.some(p => lowerValue.includes(p))) {
    return true;
  }

  const commentIndicators = [
    '// example', '// todo', '// replace', '/* example',
    '# example', '# todo', '// e.g.', '// eg:',
    // 'process.env.' is intentional: a match on this line means the 40-char value
    // is likely part of an env var pattern (e.g., aws_secret = process.env.AWS_SECRET),
    // not a hardcoded secret.
    'process.env.',
  ];

  if (commentIndicators.some(c => lowerLine.includes(c))) {
    return true;
  }

  if (lowerLine.includes('.env.example') || lowerLine.includes('.env.sample')) {
    return true;
  }

  return false;
}

/**
 * Filters findings by minimum severity threshold.
 *
 * @param findings - Array of secret findings
 * @param threshold - Minimum severity to include
 * @returns Filtered findings meeting or exceeding the threshold
 *
 * @example
 * filterBySeverity(findings, 'medium') // excludes low-severity findings
 */
export function filterBySeverity<T extends { severity: SecretSeverity }>(findings: T[], threshold: SecretSeverity): T[] {
  const severityOrder: Record<SecretSeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  const minSeverity = severityOrder[threshold];
  return findings.filter(f => severityOrder[f.severity] >= minSeverity);
}
