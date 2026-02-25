/**
 * Directive Utilities
 *
 * Shared helpers for constructing directive payloads injected via additionalContext.
 */
/**
 * Builds a <gv> directive tag from a runtime directive message.
 * Used by both SubagentStop and directive-delivery hooks to format
 * directives for injection via additionalContext.
 *
 * @param message - The pre-formatted directive message from the runtime engine
 * @returns A <gv>...</gv> string ready to be passed as additionalContext
 */
export declare function buildGvDirectiveTag(message: string): string;
