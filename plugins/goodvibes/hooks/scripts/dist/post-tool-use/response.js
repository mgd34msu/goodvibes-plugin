/**
 * Response Utilities for Post-Tool-Use Hook
 *
 * Common response creation and message handling.
 */
/**
 * Creates a hook response with optional system message.
 */
export function createResponse(systemMessage) {
    return {
        continue: true,
        systemMessage,
    };
}
/**
 * Combines multiple automation messages into a single system message.
 */
export function combineMessages(messages) {
    return messages.length > 0 ? messages.join(' | ') : undefined;
}
