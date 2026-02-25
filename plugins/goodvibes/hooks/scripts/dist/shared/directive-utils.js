/**
 * Directive Utilities
 *
 * Shared helpers for constructing directive payloads injected via additionalContext.
 */
/**
 * Builds a <gv> directive tag from a runtime directive message.
 * Used by PostToolUse Task hook to format
 * directives for injection via additionalContext.
 *
 * @param message - The pre-formatted directive message from the runtime engine
 * @returns A <gv>...</gv> string ready to be passed as additionalContext
 */
export function buildGvDirectiveTag(message) {
    const gvPayload = JSON.stringify({
        action: 'directive',
        message,
    });
    return `<gv>${gvPayload}</gv>`;
}
