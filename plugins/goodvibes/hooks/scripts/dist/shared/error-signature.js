/**
 * Error Signature Generation
 *
 * Provides stable signature generation for error deduplication and tracking.
 * This is the canonical implementation used across all GoodVibes hooks.
 */
/** Maximum length for normalized error message before hashing. */
const ERROR_NORMALIZE_MAX_LENGTH = 200;
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
export function generateErrorSignature(error, toolName) {
    // Remove variable parts like file paths, line numbers, timestamps
    let normalized = error
        // Remove absolute paths (Windows and Unix)
        .replace(/[A-Z]:\\[^\s:]+/gi, '<PATH>')
        .replace(/\/[^\s:]+/g, '<PATH>')
        // Remove line/column numbers
        .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
        .replace(/line \d+/gi, 'line <LINE>')
        // Remove timestamps
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')
        // Remove hex addresses
        .replace(/0x[a-f0-9]+/gi, '<ADDR>')
        // Remove dynamic numbers
        .replace(/\d+/g, 'N')
        // Remove quoted strings
        .replace(/(['"])[^'"]*\1/g, 'STR')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        // Limit length to avoid overly long signatures
        .slice(0, ERROR_NORMALIZE_MAX_LENGTH);
    // Create a simple hash of the normalized error
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    const hexHash = Math.abs(hash).toString(16);
    // Include tool name if provided
    if (toolName) {
        return `${toolName}::err_${hexHash}`;
    }
    return `err_${hexHash}`;
}
