/**
 * Secret value redaction utilities
 *
 * Safe display of secret values by masking most characters
 * while preserving a short prefix for identification.
 *
 * @module core/security/redaction
 */

/**
 * Redacts a secret value for safe display in reports.
 *
 * Shows the first `visibleChars` characters followed by asterisks.
 * For very short values, all characters are redacted.
 *
 * @param value - The secret value to redact
 * @param visibleChars - Number of characters to show at start (default: 4)
 * @returns Redacted string with asterisks replacing hidden characters
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
