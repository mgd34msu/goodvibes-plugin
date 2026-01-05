/**
 * Validation handlers - refactored into focused modules
 *
 * Provides MCP tools for validating code implementation against best practices,
 * security patterns, TypeScript conventions, and skill-specific patterns.
 *
 * @module handlers/validation
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { safeExec, parseSkillMetadata, extractSkillPatterns, fileExists } from '../../utils.js';

import { ValidationIssue, ValidationContext, SkillPatterns, ValidateImplementationArgs, CheckTypesArgs } from './types.js';
import { runSecurityChecks } from './security-checks.js';
import { runStructureChecks } from './structure-checks.js';
import { runErrorHandlingChecks } from './error-handling-checks.js';
import { runTypeScriptChecks } from './typescript-checks.js';
import { runNamingChecks } from './naming-checks.js';
import { runBestPracticesChecks } from './best-practices-checks.js';
import { runSkillPatternChecks } from './skill-pattern-checks.js';

// Re-export types
export { ValidateImplementationArgs, CheckTypesArgs } from './types.js';

/**
 * Handles the validate_implementation MCP tool call.
 *
 * Validates source files against multiple check categories:
 * - security: Checks for common security issues
 * - structure: Validates file and code structure
 * - errors: Checks error handling patterns
 * - typescript: TypeScript-specific checks
 * - naming: Validates naming conventions
 * - best-practices: General best practice checks
 * - skill-patterns: Skill-specific pattern matching
 *
 * @param args - The validate_implementation tool arguments
 * @param args.files - Files to validate
 * @param args.checks - Check categories to run (default: ['all'])
 * @param args.skill - Optional skill to match patterns against
 * @returns MCP tool response with validation results and score
 *
 * @example
 * await handleValidateImplementation({
 *   files: ['src/api/users.ts'],
 *   checks: ['security', 'typescript']
 * });
 * // Returns: {
 * //   valid: false,
 * //   score: 75,
 * //   grade: 'C',
 * //   issues: [{ severity: 'error', rule: 'security/sql-injection', ... }],
 * //   summary: { errors: 1, warnings: 2, files_checked: 1 }
 * // }
 */
export async function handleValidateImplementation(args: ValidateImplementationArgs): Promise<ToolResponse> {
  const issues: ValidationIssue[] = [];
  const checksRun: string[] = [];
  const checks = args.checks || ['all'];
  const runAll = checks.includes('all');

  // Load skill patterns if a skill is specified
  let skillPatterns: SkillPatterns = {};

  if (args.skill) {
    await parseSkillMetadata(args.skill);
    skillPatterns = await extractSkillPatterns(args.skill);
  }

  for (const file of args.files) {
    const filePath = path.resolve(PROJECT_ROOT, file);

    if (!await fileExists(filePath)) {
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

    const content = await fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const ext = path.extname(file);
    const isTypeScript = ext === '.ts' || ext === '.tsx';
    const isReact = ext === '.tsx' || ext === '.jsx' || content.includes('import React') || content.includes("from 'react'");

    const ctx: ValidationContext = { content, lines, file, ext, isTypeScript, isReact };

    // Run security checks
    if (runAll || checks.includes('security')) {
      checksRun.push('security');
      issues.push(...runSecurityChecks(ctx));
    }

    // Run structure checks
    if (runAll || checks.includes('structure')) {
      checksRun.push('structure');
      issues.push(...runStructureChecks(ctx));
    }

    // Run error handling checks
    if (runAll || checks.includes('errors')) {
      checksRun.push('errors');
      issues.push(...runErrorHandlingChecks(ctx));
    }

    // Run TypeScript checks
    if ((runAll || checks.includes('typescript')) && isTypeScript) {
      checksRun.push('typescript');
      issues.push(...runTypeScriptChecks(ctx));
    }

    // Run naming checks
    if (runAll || checks.includes('naming')) {
      checksRun.push('naming');
      issues.push(...runNamingChecks(ctx));
    }

    // Run best practices checks
    if (runAll || checks.includes('best-practices')) {
      checksRun.push('best-practices');
      issues.push(...runBestPracticesChecks(ctx));
    }

    // Run skill pattern checks
    if (args.skill && skillPatterns) {
      checksRun.push('skill-patterns');
      issues.push(...runSkillPatternChecks(ctx, skillPatterns));
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
 * Handles the check_types MCP tool call.
 *
 * Runs TypeScript type checking on the project or specific files using
 * `tsc --noEmit`. Parses TypeScript error output and returns structured results.
 *
 * @param args - The check_types tool arguments
 * @param args.files - Specific files to check (defaults to all)
 * @param args.strict - Whether to run with --strict flag
 * @param args.include_suggestions - Whether to include fix suggestions
 * @returns MCP tool response with type errors and summary
 *
 * @example
 * await handleCheckTypes({ strict: true });
 * // Returns: {
 * //   valid: false,
 * //   errors: [{ file: 'src/api.ts', line: 42, code: 'TS2345', message: '...' }],
 * //   summary: { files_checked: 'all', errors: 3, warnings: 0 }
 * // }
 *
 * @example
 * await handleCheckTypes({ files: ['src/utils.ts'], include_suggestions: true });
 * // Type checks only the specified file with suggestions
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
