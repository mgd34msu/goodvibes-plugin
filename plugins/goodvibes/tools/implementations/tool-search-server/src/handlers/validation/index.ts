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
 * Finds the nearest tsconfig.json file from the given directory.
 * Walks up the directory tree until it finds one or hits the root.
 *
 * @param startDir - Directory to start searching from
 * @returns Path to tsconfig.json or null if not found
 */
async function findTsConfig(startDir: string): Promise<string | null> {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    if (await fileExists(tsconfigPath)) {
      return tsconfigPath;
    }
    dir = path.dirname(dir);
  }

  // Check root directory as well
  const rootTsconfig = path.join(root, 'tsconfig.json');
  if (await fileExists(rootTsconfig)) {
    return rootTsconfig;
  }

  return null;
}

/**
 * Handles the check_types MCP tool call.
 *
 * Runs TypeScript type checking on the project or specific files using
 * `tsc --noEmit`. Automatically detects and uses the project's tsconfig.json
 * to ensure proper resolution of path aliases, JSX settings, and other
 * project-specific TypeScript configuration.
 *
 * @param args - The check_types tool arguments
 * @param args.files - Specific files to check (defaults to all)
 * @param args.strict - Whether to run with --strict flag (overrides tsconfig)
 * @param args.include_suggestions - Whether to include fix suggestions
 * @returns MCP tool response with type errors and summary
 *
 * @example
 * await handleCheckTypes({ strict: true });
 * // Returns: {
 * //   valid: false,
 * //   errors: [{ file: 'src/api.ts', line: 42, code: 'TS2345', message: '...' }],
 * //   summary: { files_checked: 'all', errors: 3, warnings: 0, tsconfig: 'tsconfig.json' }
 * // }
 *
 * @example
 * await handleCheckTypes({ files: ['src/utils.ts'], include_suggestions: true });
 * // Type checks only the specified file with suggestions
 */
export async function handleCheckTypes(args: CheckTypesArgs): Promise<ToolResponse> {
  // Resolve file paths first
  const resolvedFiles = args.files?.length
    ? args.files.map(f => path.resolve(PROJECT_ROOT, f))
    : [];

  // Find tsconfig.json starting from the first file's directory (if files specified)
  // Otherwise start from PROJECT_ROOT
  const searchStartDir = resolvedFiles.length > 0
    ? path.dirname(resolvedFiles[0])
    : PROJECT_ROOT;
  const tsconfigPath = await findTsConfig(searchStartDir);

  // Build the tsc command with proper flags
  const cmdParts = ['npx', 'tsc', '--noEmit'];

  // Use --project to respect the project's tsconfig.json
  if (tsconfigPath) {
    cmdParts.push('--project', `"${tsconfigPath}"`);
  }

  // Only add --strict if explicitly requested (overrides tsconfig)
  if (args.strict) {
    cmdParts.push('--strict');
  }

  // Add specific files if provided
  if (resolvedFiles.length > 0) {
    cmdParts.push(...resolvedFiles.map(f => `"${f}"`));
  }

  const command = cmdParts.join(' ') + ' 2>&1';

  const result = await safeExec(
    command,
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
    // Normalize file path to be relative to project root for cleaner output
    let filePath = match[1];
    if (path.isAbsolute(filePath)) {
      filePath = path.relative(PROJECT_ROOT, filePath);
    }

    errors.push({
      file: filePath,
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      code: match[4],
      message: match[5],
      suggestion: args.include_suggestions ? getSuggestionForError(match[4], match[5]) : '',
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
          tsconfig: tsconfigPath ? path.relative(PROJECT_ROOT, tsconfigPath) : null,
        },
      }, null, 2),
    }],
  };
}

/**
 * Provides helpful suggestions based on TypeScript error codes.
 *
 * @param errorCode - The TypeScript error code (e.g., 'TS2345')
 * @param message - The error message
 * @returns A suggestion string for fixing the error
 */
function getSuggestionForError(errorCode: string, message: string): string {
  const suggestions: Record<string, string> = {
    'TS2307': 'Check module path and ensure the file exists. Verify path aliases in tsconfig.json.',
    'TS2304': 'Import the missing type or declare it. Check if @types package is needed.',
    'TS2345': 'Check argument types match parameter types. May need type assertion or conversion.',
    'TS2322': 'Type mismatch in assignment. Check if types are compatible or need conversion.',
    'TS2339': 'Property does not exist. Check spelling or add to interface/type definition.',
    'TS2551': 'Property name typo. Check the suggestion in the error message.',
    'TS2769': 'No matching overload. Check argument count and types for the function call.',
    'TS7006': 'Parameter needs explicit type. Add type annotation to parameter.',
    'TS7031': 'Binding element needs type. Add type annotation to destructured parameter.',
    'TS2532': 'Object possibly undefined. Add null check or use optional chaining (?.).',
    'TS2531': 'Object possibly null. Add null check or use optional chaining (?.).',
    'TS18046': 'Value is of type unknown. Add type guard or assertion.',
    'TS2352': 'Type conversion error. Use proper type assertion or conversion.',
    'TS6133': 'Unused variable/import. Remove or use the variable, or prefix with underscore.',
    'TS2554': 'Wrong number of arguments. Check function signature.',
    'TS2741': 'Missing required property. Add the property to the object.',
    'TS2740': 'Missing multiple properties. Add all required properties.',
  };

  return suggestions[errorCode] || 'Check type definitions and ensure types are compatible.';
}
