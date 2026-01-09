/**
 * Tool Validators for Pre-Tool-Use Hook
 *
 * Validates prerequisites before MCP tool execution:
 * - detect_stack: Check project has package.json
 * - get_schema: Check schema file exists
 * - run_smoke_test: Check npm/pnpm available
 * - check_types: Check TypeScript available
 * - validate_implementation: Check files exist
 */

import path from 'node:path';

import {
  respond,
  allowTool,
  blockTool,
  fileExists,
} from '../shared/index.js';

import type { HookInput } from '../shared/index.js';

/**
 * Validates prerequisites for detect_stack tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateDetectStack(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  if (!(await fileExists(path.join(cwd, 'package.json')))) {
    respond(
      blockTool(
        'PreToolUse',
        'No package.json found in project root. Cannot detect stack.'
      ),
      true
    );
    return;
  }
  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for get_schema tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateGetSchema(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  // Check for common schema files
  const schemaFiles = [
    'prisma/schema.prisma',
    'drizzle.config.ts',
    'drizzle/schema.ts',
  ];

  const results = await Promise.all(
    schemaFiles.map((f) => fileExists(path.join(cwd, f)))
  );
  const found = results.some(Boolean);

  if (!found) {
    // Allow but warn
    respond(
      allowTool('PreToolUse', 'No schema file detected. get_schema may fail.')
    );
    return;
  }
  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for run_smoke_test tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateRunSmokeTest(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  // Check if package.json exists
  if (!(await fileExists(path.join(cwd, 'package.json')))) {
    respond(
      blockTool('PreToolUse', 'No package.json found. Cannot run smoke tests.'),
      true
    );
    return;
  }

  // Check for package manager
  const [hasPnpm, hasYarn, hasNpm] = await Promise.all([
    fileExists(path.join(cwd, 'pnpm-lock.yaml')),
    fileExists(path.join(cwd, 'yarn.lock')),
    fileExists(path.join(cwd, 'package-lock.json')),
  ]);

  if (!hasPnpm && !hasYarn && !hasNpm) {
    respond(
      allowTool(
        'PreToolUse',
        'No lockfile detected. Install dependencies first.'
      )
    );
    return;
  }

  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for check_types tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateCheckTypes(input: HookInput): Promise<void> {
  const cwd = input.cwd || process.cwd();
  // Check for TypeScript config
  if (!(await fileExists(path.join(cwd, 'tsconfig.json')))) {
    respond(
      blockTool(
        'PreToolUse',
        'No tsconfig.json found. TypeScript not configured.'
      ),
      true
    );
    return;
  }

  respond(allowTool('PreToolUse'));
}

/**
 * Validates prerequisites for validate_implementation tool.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves after validation is complete
 */
export async function validateImplementation(_input: HookInput): Promise<void> {
  // Just allow and let the tool handle validation
  respond(allowTool('PreToolUse'));
}

/** Tool validators keyed by tool name */
export const TOOL_VALIDATORS: Record<
  string,
  (_input: HookInput) => Promise<void>
> = {
  detect_stack: validateDetectStack,
  get_schema: validateGetSchema,
  run_smoke_test: validateRunSmokeTest,
  check_types: validateCheckTypes,
  validate_implementation: validateImplementation,
};
