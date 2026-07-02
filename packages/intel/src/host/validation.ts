/**
 * Envelope-decoupled argument validation for position-addressed tools.
 *
 * Rebuilt from project-engine `core/code-intel/validation.ts` with the v1
 * `McpResponse`/`fail()` coupling removed: these return plain discriminated
 * unions carrying an error STRING, which the tool wraps in `core/envelope`.
 * Path resolution/existence is the tool's job (via `core/fsx`); this validates
 * only argument shape.
 */

/** A validated set of position arguments. */
export interface ValidatedPosition {
  file: string;
  line: number;
  column: number;
}

/** Result of validating position arguments. */
export type PositionValidation =
  | { valid: true; value: ValidatedPosition }
  | { valid: false; error: string };

/**
 * Validate `{ file, line, column }` argument shape.
 * @param args - raw tool arguments
 */
export function validatePositionArgs(args: unknown): PositionValidation {
  if (!args || typeof args !== 'object') {
    return { valid: false, error: 'Invalid arguments: expected an object' };
  }
  const { file, line, column } = args as Record<string, unknown>;

  if (!file || typeof file !== 'string') {
    return { valid: false, error: 'Invalid or missing "file" parameter (expected a string path)' };
  }
  if (!isValidLine(line)) {
    return { valid: false, error: 'Invalid "line": expected a positive integer (1-based)' };
  }
  if (!isValidColumn(column)) {
    return { valid: false, error: 'Invalid "column": expected a positive integer (1-based)' };
  }
  return { valid: true, value: { file, line, column } };
}

/** True when `line` is a 1-based positive integer. */
export function isValidLine(line: unknown): line is number {
  return typeof line === 'number' && line >= 1 && Number.isInteger(line);
}

/** True when `column` is a 1-based positive integer. */
export function isValidColumn(column: unknown): column is number {
  return typeof column === 'number' && column >= 1 && Number.isInteger(column);
}
