/**
 * Error Signature Generation
 *
 * Provides stable signature generation for error deduplication and tracking.
 * This is the canonical implementation used across all GoodVibes hooks.
 */
/**
 * Generates a stable signature from tool name and error message for deduplication.
 *
 * This function normalizes error messages by:
 * - Replacing file paths with <PATH>
 * - Replacing line/column numbers with <LINE>:<COL>
 * - Replacing timestamps with <TIMESTAMP>
 * - Replacing hex addresses with <ADDR>
 * - Normalizing whitespace
 *
 * The normalized error is then hashed to create a short, stable signature.
 *
 * @param error - The error message to generate a signature for
 * @param toolName - Optional tool name to include in the signature
 * @returns A stable error signature in the format "err_hexhash" or "toolName::err_hexhash"
 */
export declare function generateErrorSignature(error: string, toolName?: string): string;
