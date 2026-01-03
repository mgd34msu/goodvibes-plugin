/**
 * Validation handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';
import { safeExec, parseSkillMetadata, extractFunctionBody, extractSkillPatterns } from '../utils.js';

export interface ValidateImplementationArgs {
  files: string[];
  skill?: string;
  checks?: string[];
}

export interface CheckTypesArgs {
  files?: string[];
  strict?: boolean;
  include_suggestions?: boolean;
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  rule: string;
  message: string;
  suggestion: string;
}

/**
 * Handle validate_implementation tool call
 */
export async function handleValidateImplementation(args: ValidateImplementationArgs): Promise<ToolResponse> {
  const issues: ValidationIssue[] = [];
  const checksRun: string[] = [];
  const checks = args.checks || ['all'];
  const runAll = checks.includes('all');

  // Load skill patterns if a skill is specified
  let skillPatterns: {
    required_exports?: string[];
    required_imports?: string[];
    naming_conventions?: Record<string, string>;
    must_include?: string[];
    must_not_include?: string[];
  } = {};

  if (args.skill) {
    const skillMeta = parseSkillMetadata(args.skill);
    // Try to extract patterns from skill content
    skillPatterns = extractSkillPatterns(args.skill);
  }

  for (const file of args.files) {
    const filePath = path.resolve(PROJECT_ROOT, file);

    if (!fs.existsSync(filePath)) {
      issues.push({
        severity: 'error',
        file,
        line: 0,
        rule: 'file/exists',
        message: 'File not found',
        suggestion: 'Check the file path',
      });
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const ext = path.extname(file);
    const isTypeScript = ext === '.ts' || ext === '.tsx';
    const isReact = ext === '.tsx' || ext === '.jsx' || content.includes('import React') || content.includes("from 'react'");

    // ========== Security Checks ==========
    if (runAll || checks.includes('security')) {
      checksRun.push('security');

      // Check for hardcoded secrets
      const secretPatterns = [
        { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'password' },
        { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'API key' },
        { pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/gi, name: 'secret/token' },
        { pattern: /(?:aws[_-]?(?:access|secret))[_-]?(?:key|id)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'AWS credential' },
        { pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, name: 'private key' },
      ];

      lines.forEach((line, i) => {
        // Skip if it's reading from env
        if (line.includes('process.env') || line.includes('import.meta.env')) return;

        for (const { pattern, name } of secretPatterns) {
          if (pattern.test(line)) {
            issues.push({
              severity: 'error',
              file,
              line: i + 1,
              rule: 'security/no-hardcoded-secrets',
              message: `Potential hardcoded ${name}`,
              suggestion: 'Move sensitive data to environment variables',
            });
          }
          pattern.lastIndex = 0; // Reset regex
        }
      });

      // Check for dangerous functions
      const dangerousPatterns = [
        { pattern: /eval\s*\(/, rule: 'security/no-eval', message: 'Use of eval() is dangerous' },
        { pattern: /innerHTML\s*=/, rule: 'security/no-innerhtml', message: 'innerHTML can lead to XSS' },
        { pattern: /dangerouslySetInnerHTML/, rule: 'security/dangerously-set-inner-html', message: 'dangerouslySetInnerHTML should be used carefully' },
        { pattern: /document\.write/, rule: 'security/no-document-write', message: 'document.write can be exploited' },
        { pattern: /new\s+Function\s*\(/, rule: 'security/no-new-function', message: 'new Function() is similar to eval()' },
      ];

      lines.forEach((line, i) => {
        for (const { pattern, rule, message } of dangerousPatterns) {
          if (pattern.test(line)) {
            issues.push({
              severity: rule.includes('dangerously') ? 'warning' : 'error',
              file,
              line: i + 1,
              rule,
              message,
              suggestion: 'Use safer alternatives or sanitize input',
            });
          }
        }
      });

      // SQL injection risk
      if (content.includes('query(') || content.includes('execute(')) {
        lines.forEach((line, i) => {
          if (/query\s*\(\s*[`'"].*\$\{/.test(line) || /query\s*\(\s*.*\+/.test(line)) {
            issues.push({
              severity: 'error',
              file,
              line: i + 1,
              rule: 'security/sql-injection',
              message: 'Potential SQL injection vulnerability',
              suggestion: 'Use parameterized queries or prepared statements',
            });
          }
        });
      }
    }

    // ========== Structure Checks ==========
    if (runAll || checks.includes('structure')) {
      checksRun.push('structure');

      // Check for exports
      const hasExport = content.includes('export default') || content.includes('export {') ||
                       content.includes('export const') || content.includes('export function') ||
                       content.includes('export class') || content.includes('export type') ||
                       content.includes('export interface');

      if (!hasExport && !file.includes('index') && !file.includes('.d.ts')) {
        issues.push({
          severity: 'warning',
          file,
          line: 1,
          rule: 'structure/missing-export',
          message: 'No exports found in file',
          suggestion: 'Add exports to make the module usable',
        });
      }

      // React component checks
      if (isReact) {
        const componentName = path.basename(file, ext);
        const pascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(componentName);

        if (!pascalCase && !file.includes('index') && !file.includes('use')) {
          issues.push({
            severity: 'info',
            file,
            line: 1,
            rule: 'structure/component-naming',
            message: 'React component files should use PascalCase',
            suggestion: `Rename to ${componentName.charAt(0).toUpperCase() + componentName.slice(1)}`,
          });
        }

        // Check for proper hook usage
        const hookUsage = content.match(/use[A-Z]\w+/g);
        if (hookUsage) {
          lines.forEach((line, i) => {
            if (/if\s*\(.*use[A-Z]/.test(line) || /&&\s*use[A-Z]/.test(line)) {
              issues.push({
                severity: 'error',
                file,
                line: i + 1,
                rule: 'react/hooks-rules',
                message: 'Hooks cannot be called conditionally',
                suggestion: 'Move hook call outside of conditions',
              });
            }
          });
        }
      }

      // File size check
      if (lines.length > 500) {
        issues.push({
          severity: 'info',
          file,
          line: 1,
          rule: 'structure/file-size',
          message: `File has ${lines.length} lines, consider splitting`,
          suggestion: 'Break large files into smaller, focused modules',
        });
      }

      // Check for barrel exports in index files
      if (file.includes('index') && content.length < 50 && !content.includes('export')) {
        issues.push({
          severity: 'info',
          file,
          line: 1,
          rule: 'structure/empty-index',
          message: 'Index file appears empty or incomplete',
          suggestion: 'Add barrel exports or remove empty index',
        });
      }
    }

    // ========== Error Handling Checks ==========
    if (runAll || checks.includes('errors')) {
      checksRun.push('errors');

      // Check async functions for error handling
      const asyncMatches = content.matchAll(/async\s+(?:function\s+)?(\w+)?\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{/g);
      for (const match of asyncMatches) {
        const startIndex = match.index || 0;
        const funcContent = extractFunctionBody(content, startIndex);

        if (funcContent && !funcContent.includes('try') && !funcContent.includes('catch') && !funcContent.includes('.catch(')) {
          const lineNum = content.substring(0, startIndex).split('\n').length;
          issues.push({
            severity: 'warning',
            file,
            line: lineNum,
            rule: 'error-handling/async-try-catch',
            message: 'Async function without error handling',
            suggestion: 'Wrap async code in try/catch or use .catch()',
          });
        }
      }

      // Check for empty catch blocks
      lines.forEach((line, i) => {
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || (line.includes('catch') && lines[i + 1]?.trim() === '}')) {
          issues.push({
            severity: 'warning',
            file,
            line: i + 1,
            rule: 'error-handling/empty-catch',
            message: 'Empty catch block swallows errors',
            suggestion: 'Log the error or handle it appropriately',
          });
        }
      });

      // Check for console.log in catch blocks (should use console.error)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('catch') && lines[i + 1]?.includes('console.log')) {
          issues.push({
            severity: 'info',
            file,
            line: i + 2,
            rule: 'error-handling/console-error',
            message: 'Use console.error for errors, not console.log',
            suggestion: 'Replace console.log with console.error in catch blocks',
          });
        }
      }
    }

    // ========== TypeScript Checks ==========
    if ((runAll || checks.includes('typescript')) && isTypeScript) {
      checksRun.push('typescript');

      // Check for 'any' type
      const anyMatches = content.matchAll(/:\s*any\b/g);
      for (const match of anyMatches) {
        const lineNum = content.substring(0, match.index || 0).split('\n').length;
        issues.push({
          severity: 'warning',
          file,
          line: lineNum,
          rule: 'typescript/no-any',
          message: 'Avoid using "any" type',
          suggestion: 'Use a more specific type or "unknown"',
        });
      }

      // Check for @ts-ignore without explanation
      lines.forEach((line, i) => {
        if (/@ts-ignore(?!\s+.{10,})/.test(line)) {
          issues.push({
            severity: 'warning',
            file,
            line: i + 1,
            rule: 'typescript/no-ts-ignore',
            message: '@ts-ignore should include an explanation',
            suggestion: 'Add a comment explaining why the ignore is needed',
          });
        }
      });

      // Check for non-null assertions
      const assertionCount = (content.match(/!\./g) || []).length;
      if (assertionCount > 5) {
        issues.push({
          severity: 'info',
          file,
          line: 1,
          rule: 'typescript/excessive-non-null',
          message: `${assertionCount} non-null assertions found`,
          suggestion: 'Consider proper null checking instead of assertions',
        });
      }
    }

    // ========== Naming Conventions ==========
    if (runAll || checks.includes('naming')) {
      checksRun.push('naming');

      // Check function naming (camelCase)
      const funcMatches = content.matchAll(/(?:function|const|let)\s+([a-zA-Z_]\w*)\s*(?:=\s*(?:async\s*)?\(|[\(<])/g);
      for (const match of funcMatches) {
        const name = match[1];
        if (name.startsWith('_')) continue; // Allow underscore prefix
        if (/^[A-Z]/.test(name) && !isReact) {
          // Not PascalCase for non-React functions
        } else if (!/^[a-z][a-zA-Z0-9]*$/.test(name) && !/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
          const lineNum = content.substring(0, match.index || 0).split('\n').length;
          issues.push({
            severity: 'info',
            file,
            line: lineNum,
            rule: 'naming/camelCase',
            message: `Function "${name}" should use camelCase`,
            suggestion: 'Use camelCase for functions and variables',
          });
        }
      }

      // Check for SCREAMING_CASE constants
      const constMatches = content.matchAll(/const\s+([a-zA-Z_]\w*)\s*=/g);
      for (const match of constMatches) {
        const name = match[1];
        // If it's all caps with underscores, it should be a true constant
        if (/^[A-Z][A-Z0-9_]+$/.test(name)) {
          const lineNum = content.substring(0, match.index || 0).split('\n').length;
          const line = lines[lineNum - 1] || '';
          // Check if it's actually a constant value
          if (line.includes('()') || line.includes('new ')) {
            issues.push({
              severity: 'info',
              file,
              line: lineNum,
              rule: 'naming/screaming-case',
              message: `SCREAMING_CASE "${name}" should be for constant values only`,
              suggestion: 'Use SCREAMING_CASE only for true constants, not functions or instances',
            });
          }
        }
      }
    }

    // ========== Best Practices ==========
    if (runAll || checks.includes('best-practices')) {
      checksRun.push('best-practices');

      // Check for console.log (should be removed in production)
      lines.forEach((line, i) => {
        if (/console\.(log|debug|info)\(/.test(line) && !line.includes('//') && !line.trim().startsWith('//')) {
          issues.push({
            severity: 'info',
            file,
            line: i + 1,
            rule: 'best-practices/no-console',
            message: 'console.log found in code',
            suggestion: 'Remove or use a proper logging library',
          });
        }
      });

      // Check for TODO/FIXME comments
      lines.forEach((line, i) => {
        if (/\/\/\s*(TODO|FIXME|HACK|XXX):/i.test(line)) {
          issues.push({
            severity: 'info',
            file,
            line: i + 1,
            rule: 'best-practices/no-todo',
            message: 'TODO/FIXME comment found',
            suggestion: 'Address the TODO or create a ticket to track it',
          });
        }
      });

      // Check for magic numbers
      const magicNumberRegex = /[^a-zA-Z0-9_"](\d{2,})[^a-zA-Z0-9_"]/g;
      lines.forEach((line, i) => {
        // Skip obvious non-magic numbers
        if (line.includes('import') || line.includes('require') || line.includes('version')) return;
        if (line.includes('port') || line.includes('timeout') || line.includes('delay')) return;

        let match;
        while ((match = magicNumberRegex.exec(line)) !== null) {
          const num = parseInt(match[1]);
          if (num > 1 && num !== 100 && num !== 1000 && ![200, 201, 204, 400, 401, 403, 404, 500].includes(num)) {
            issues.push({
              severity: 'info',
              file,
              line: i + 1,
              rule: 'best-practices/no-magic-numbers',
              message: `Magic number ${num} found`,
              suggestion: 'Extract to a named constant',
            });
            break; // Only report once per line
          }
        }
        magicNumberRegex.lastIndex = 0;
      });
    }

    // ========== Skill Pattern Validation ==========
    if (args.skill && skillPatterns) {
      checksRun.push('skill-patterns');

      // Check required imports
      if (skillPatterns.required_imports) {
        for (const imp of skillPatterns.required_imports) {
          if (!content.includes(imp)) {
            issues.push({
              severity: 'warning',
              file,
              line: 1,
              rule: 'skill/missing-import',
              message: `Skill requires import: ${imp}`,
              suggestion: `Add import for ${imp}`,
            });
          }
        }
      }

      // Check must include patterns
      if (skillPatterns.must_include) {
        for (const pattern of skillPatterns.must_include) {
          if (!content.includes(pattern)) {
            issues.push({
              severity: 'warning',
              file,
              line: 1,
              rule: 'skill/missing-pattern',
              message: `Skill expects pattern: ${pattern}`,
              suggestion: `Implement the expected pattern`,
            });
          }
        }
      }

      // Check must not include patterns
      if (skillPatterns.must_not_include) {
        for (const pattern of skillPatterns.must_not_include) {
          if (content.includes(pattern)) {
            const lineNum = content.split('\n').findIndex(l => l.includes(pattern)) + 1;
            issues.push({
              severity: 'warning',
              file,
              line: lineNum || 1,
              rule: 'skill/forbidden-pattern',
              message: `Skill advises against: ${pattern}`,
              suggestion: 'Remove or replace with recommended alternative',
            });
          }
        }
      }
    }
  }

  // Calculate summary
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;
  const score = Math.max(0, 100 - (errors * 20) - (warnings * 5) - (info * 1));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        valid: errors === 0,
        score,
        grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
        issues,
        summary: {
          errors,
          warnings,
          info,
          files_checked: args.files.length,
          checks_run: [...new Set(checksRun)],
        },
        skill: args.skill || null,
      }, null, 2),
    }],
  };
}

/**
 * Handle check_types tool call
 */
export async function handleCheckTypes(args: CheckTypesArgs): Promise<ToolResponse> {
  const filesArg = args.files?.length ? args.files.join(' ') : '';
  const strictFlag = args.strict ? '--strict' : '';

  const result = await safeExec(
    `npx tsc --noEmit ${strictFlag} ${filesArg} 2>&1`,
    PROJECT_ROOT,
    60000
  );

  const errors: Array<{
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    suggestion: string;
  }> = [];

  // Parse TypeScript errors
  const errorRegex = /(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)/g;
  let match;

  while ((match = errorRegex.exec(result.stdout + result.stderr)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      code: match[4],
      message: match[5],
      suggestion: args.include_suggestions ? 'Check type definitions' : '',
    });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        valid: errors.length === 0,
        errors,
        summary: {
          files_checked: args.files?.length || 'all',
          errors: errors.length,
          warnings: 0,
        },
      }, null, 2),
    }],
  };
}
