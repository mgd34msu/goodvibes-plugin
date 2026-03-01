/**
 * Code Intelligence Validation Utilities
 *
 * Async-safe validation functions for LSP tool arguments.
 *
 * @module core/code-intel/validation
 */

import * as path from 'node:path';

import { getProjectRoot } from '../../shared/config.js';
import { fail } from '../../shared/response.js';
import { fileExists } from '../../shared/utils.js';
import type { McpResponse } from '../../shared/types.js';
import type { PositionArgs, ValidationResult } from './types.js';

/**
 * Validate position arguments for LSP tools.
 *
 * Checks that file, line, and column are valid and that the file exists.
 *
 * @param args - The arguments to validate
 * @returns Validation result with resolved file path or error response
 *
 * @example
 * ```typescript
 * const result = await validatePositionArgs(args);
 * if (!result.valid) return result.error;
 * const filePath = result.filePath;
 * ```
 */
export async function validatePositionArgs(args: unknown): Promise<ValidationResult> {
  if (!args || typeof args !== 'object') {
    return { valid: false, error: fail('Invalid arguments: expected object') };
  }

  const { file, line, column } = args as Record<string, unknown>;

  if (!file || typeof file !== 'string') {
    return { valid: false, error: fail('Invalid or missing file parameter') };
  }

  if (typeof line !== 'number' || line < 1 || !Number.isInteger(line)) {
    return { valid: false, error: fail('Invalid line: must be a positive integer') };
  }

  if (typeof column !== 'number' || column < 1 || !Number.isInteger(column)) {
    return { valid: false, error: fail('Invalid column: must be a positive integer') };
  }

  const projectRoot = getProjectRoot();
  const filePath = path.resolve(projectRoot, file);

  if (!filePath.startsWith(projectRoot)) {
    return { valid: false, error: fail('File path escapes project root') };
  }

  if (!(await fileExists(filePath))) {
    return { valid: false, error: fail(`File not found: ${file}`) };
  }

  return { valid: true, filePath };
}

/**
 * Validate that a file path exists.
 *
 * @param file - The file path (relative or absolute)
 * @returns Validation result with resolved file path or error response
 */
export async function validateFilePath(file: unknown): Promise<ValidationResult> {
  if (!file || typeof file !== 'string') {
    return { valid: false, error: fail('Invalid or missing file parameter') };
  }

  const projectRoot = getProjectRoot();
  const filePath = path.isAbsolute(file)
    ? file
    : path.resolve(projectRoot, file);

  if (!filePath.startsWith(projectRoot)) {
    return { valid: false, error: fail('File path escapes project root') };
  }

  if (!(await fileExists(filePath))) {
    return { valid: false, error: fail(`File not found: ${file}`) };
  }

  return { valid: true, filePath };
}

/**
 * Validate that a line number is a positive integer.
 *
 * @param line - The line number to validate
 * @returns True if valid (positive integer), false otherwise
 */
export function isValidLine(line: unknown): line is number {
  return typeof line === 'number' && line >= 1 && Number.isInteger(line);
}

/**
 * Validate that a column number is a positive integer.
 *
 * @param column - The column number to validate
 * @returns True if valid (positive integer), false otherwise
 */
export function isValidColumn(column: unknown): column is number {
  return typeof column === 'number' && column >= 1 && Number.isInteger(column);
}

/**
 * Validate that a value is a non-empty string.
 *
 * @param value - The value to validate
 * @returns The string value, or an error response
 */
export function requireString(
  value: unknown,
  fieldName: string
): { ok: true; value: string } | { ok: false; error: McpResponse } {
  if (!value || typeof value !== 'string') {
    return { ok: false, error: fail(`Missing required argument: ${fieldName}`) };
  }
  return { ok: true, value };
}
