/**
 * Security validation checks
 */

import { ValidationIssue, ValidationContext } from './types.js';

const SECRET_PATTERNS = [
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'password' },
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'API key' },
  { pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/gi, name: 'secret/token' },
  { pattern: /(?:aws[_-]?(?:access|secret))[_-]?(?:key|id)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'AWS credential' },
  { pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, name: 'private key' },
];

const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/, rule: 'security/no-eval', message: 'Use of eval() is dangerous' },
  { pattern: /innerHTML\s*=/, rule: 'security/no-innerhtml', message: 'innerHTML can lead to XSS' },
  { pattern: /dangerouslySetInnerHTML/, rule: 'security/dangerously-set-inner-html', message: 'dangerouslySetInnerHTML should be used carefully' },
  { pattern: /document\.write/, rule: 'security/no-document-write', message: 'document.write can be exploited' },
  { pattern: /new\s+Function\s*\(/, rule: 'security/no-new-function', message: 'new Function() is similar to eval()' },
];

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

  // SQL injection risk
  if (ctx.content.includes('query(') || ctx.content.includes('execute(')) {
    ctx.lines.forEach((line, i) => {
      if (/query\s*\(\s*[`'"].*\$\{/.test(line) || /query\s*\(\s*.*\+/.test(line)) {
        issues.push({
          severity: 'error',
          file: ctx.file,
          line: i + 1,
          rule: 'security/sql-injection',
          message: 'Potential SQL injection vulnerability',
          suggestion: 'Use parameterized queries or prepared statements',
        });
      }
    });
  }

  return issues;
}
