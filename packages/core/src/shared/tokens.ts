/**
 * Payload-true token estimation, shared across core modules.
 *
 * The estimate is computed from the exact string that is returned to the caller
 * (never from a pre-serialization guess), at ~3.5 characters per token. This is
 * the single source of truth for token accounting in every envelope, cache
 * cost figure, and telemetry payload count so the numbers agree.
 */

/** Characters-per-token divisor. Calibrated so estimates land within ~10%. */
export const PAYLOAD_CHARS_PER_TOKEN = 3.5;

/**
 * Estimate token count from the final rendered payload string.
 * @param payload - the exact string returned to the caller
 * @returns estimated token count (ceil of chars / 3.5)
 */
export function estimatePayloadTokens(payload: string): number {
  return Math.ceil(payload.length / PAYLOAD_CHARS_PER_TOKEN);
}

/**
 * Convert a token budget into an approximate character budget.
 * @param maxTokens - the token cap
 * @returns the number of characters that fit within the budget
 */
export function tokensToChars(maxTokens: number): number {
  return Math.floor(maxTokens * PAYLOAD_CHARS_PER_TOKEN);
}
