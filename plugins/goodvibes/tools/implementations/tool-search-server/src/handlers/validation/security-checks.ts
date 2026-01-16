/**
 * Security validation checks
 */

import { ValidationIssue, ValidationContext } from './types.js';

/**
 * Patterns for detecting hardcoded secrets in source code.
 * Each pattern includes a regex and human-readable name for error messages.
 * @property pattern - Regex to match potential secrets (case-insensitive, global)
 * @property name - Descriptive name for the secret type (used in error messages)
 */
export const SECRET_PATTERNS = [
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'password' },
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'API key' },
  { pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/gi, name: 'secret/token' },
  { pattern: /(?:aws[_-]?(?:access|secret))[_-]?(?:key|id)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'AWS credential' },
  { pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, name: 'private key' },
];

/**
 * Patterns for detecting dangerous code constructs that may introduce security vulnerabilities.
 * @property pattern - Regex to match the dangerous pattern
 * @property rule - Rule identifier for the validation issue
 * @property message - Description of the security concern
 */
export const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/, rule: 'security/no-eval', message: 'Use of eval() is dangerous' },
  { pattern: /innerHTML\s*=/, rule: 'security/no-innerhtml', message: 'innerHTML can lead to XSS' },
  { pattern: /dangerouslySetInnerHTML/, rule: 'security/dangerously-set-inner-html', message: 'dangerouslySetInnerHTML should be used carefully' },
  { pattern: /document\.write/, rule: 'security/no-document-write', message: 'document.write can be exploited' },
  { pattern: /new\s+Function\s*\(/, rule: 'security/no-new-function', message: 'new Function() is similar to eval()' },
];

/**
 * Runs security-focused validation checks on a file.
 * Detects hardcoded secrets, dangerous functions (eval, innerHTML), and SQL injection risks.
 * @param ctx - Validation context containing file content and metadata
 * @returns Array of security-related validation issues
 * @example
 * const issues = runSecurityChecks(ctx);
 * // May return issues like:
 * // { rule: 'security/no-hardcoded-secrets', severity: 'error', message: 'Potential hardcoded API key' }
 * // { rule: 'security/sql-injection', severity: 'error', message: 'Potential SQL injection vulnerability' }
 */
export function runSecurityChecks(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for hardcoded secrets
  ctx.lines.forEach((line, i) => {
    if (line.includes('process.env') || line.includes('import.meta.env')) return;

    for (const { pattern, name } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          severity: 'error',
          file: ctx.file,
          line: i + 1,
          rule: 'security/no-hardcoded-secrets',
          message: `Potential hardcoded ${name}`,
          suggestion: 'Move sensitive data to environment variables',
        });
      }
      pattern.lastIndex = 0;
    }
  });

  // Check for dangerous functions
  ctx.lines.forEach((line, i) => {
    for (const { pattern, rule, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          severity: rule.includes('dangerously') ? 'warning' : 'error',
          file: ctx.file,
          line: i + 1,
          rule,
          message,
          suggestion: 'Use safer alternatives or sanitize input',
        });
      }
    }
  });

  // SQL injection risk - check query(), execute(), and raw() methods
  const sqlMethods = ['query', 'execute', 'raw', 'sql'];
  const hasSqlMethod = sqlMethods.some(m => ctx.content.includes(`${m}(`));

  if (hasSqlMethod) {
    ctx.lines.forEach((line, i) => {
      // Check for template literals with interpolation: query(`...${var}...`)
      const templateLiteralPattern = /(?:query|execute|raw|sql)\s*\(\s*`[^`]*\$\{/;
      // Check for string concatenation: query("..." + var) or query(var + "...")
      const concatPattern = /(?:query|execute|raw|sql)\s*\([^)]*\+/;
      // Check for variable interpolation in strings: query("..." + variable)
      const variablePattern = /(?:query|execute|raw|sql)\s*\(\s*[a-zA-Z_]\w*\s*[,)]/;

      if (templateLiteralPattern.test(line) || concatPattern.test(line)) {
        issues.push({
          severity: 'error',
          file: ctx.file,
          line: i + 1,
          rule: 'security/sql-injection',
          message: 'Potential SQL injection vulnerability',
          suggestion: 'Use parameterized queries or prepared statements',
        });
      } else if (variablePattern.test(line) && !line.includes('?') && !line.includes('$1')) {
        // Variable passed directly without parameterization markers
        issues.push({
          severity: 'warning',
          file: ctx.file,
          line: i + 1,
          rule: 'security/sql-injection',
          message: 'SQL query with variable - verify parameterization',
          suggestion: 'Ensure query uses parameterized values',
        });
      }
    });
  }

  return issues;
}
