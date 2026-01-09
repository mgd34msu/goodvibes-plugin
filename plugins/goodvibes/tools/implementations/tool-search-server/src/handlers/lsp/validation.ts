/**
 * Shared validation utilities for LSP handlers
 *
 * Provides common argument validation logic used across LSP tool handlers.
 *
 * @module handlers/lsp/validation
 */

import * as fs from 'fs';
import * as path from 'path';

import { PROJECT_ROOT } from '../../config.js';
import { createErrorResponse, type ToolResponse } from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Standard position arguments for LSP tools.
 */
export interface PositionArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * Result of position validation - either valid with resolved path or invalid with error.
 */
export type ValidationResult =
  | { valid: true; filePath: string }
  | { valid: false; error: ToolResponse };

// =============================================================================
// Validation Functions
// =============================================================================

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
 * const result = validatePositionArgs(args);
 * if (!result.valid) {
 *   return result.error;
 * }
 * const filePath = result.filePath;
 * ```
 */
export function validatePositionArgs(args: unknown): ValidationResult {
  if (!args || typeof args !== 'object') {
    return { valid: false, error: createErrorResponse('Invalid arguments: expected object') };
  }

  const { file, line, column } = args as Record<string, unknown>;

  if (!file || typeof file !== 'string') {
    return { valid: false, error: createErrorResponse('Invalid or missing file parameter') };
  }

  if (typeof line !== 'number' || line < 1 || !Number.isInteger(line)) {
    return { valid: false, error: createErrorResponse('Invalid line: must be a positive integer') };
  }

  if (typeof column !== 'number' || column < 1 || !Number.isInteger(column)) {
    return {
      valid: false,
      error: createErrorResponse('Invalid column: must be a positive integer'),
    };
  }

  const filePath = path.resolve(PROJECT_ROOT, file);

  if (!fs.existsSync(filePath)) {
    return { valid: false, error: createErrorResponse(`File not found: ${file}`) };
  }

  return { valid: true, filePath };
}

/**
 * Validate that a file path exists.
 *
 * @param file - The file path (relative or absolute)
 * @returns Validation result with resolved file path or error response
 */
export function validateFilePath(file: unknown): ValidationResult {
  if (!file || typeof file !== 'string') {
    return { valid: false, error: createErrorResponse('Invalid or missing file parameter') };
  }

  const filePath = path.isAbsolute(file) ? file : path.resolve(PROJECT_ROOT, file);

  if (!fs.existsSync(filePath)) {
    return { valid: false, error: createErrorResponse(`File not found: ${file}`) };
  }

  return { valid: true, filePath };
}

/**
 * Validate line number argument.
 *
 * @param line - The line number to validate
 * @returns True if valid (positive integer), false otherwise
 */
export function isValidLine(line: unknown): line is number {
  return typeof line === 'number' && line >= 1 && Number.isInteger(line);
}

/**
 * Validate column number argument.
 *
 * @param column - The column number to validate
 * @returns True if valid (positive integer), false otherwise
 */
export function isValidColumn(column: unknown): column is number {
  return typeof column === 'number' && column >= 1 && Number.isInteger(column);
}
