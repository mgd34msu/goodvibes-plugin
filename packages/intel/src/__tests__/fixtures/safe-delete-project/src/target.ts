/**
 * Symbols under test for code_safe_delete.
 *  - `countdown` is only referenced within this file (a recursive self-call), so
 *    it is SAFE to delete externally — even though `consumer.ts` mentions the
 *    word "countdown" in a comment and a string (a regex scan would be fooled).
 *  - `shared` is imported and called by `consumer.ts`, so deleting it BREAKS a
 *    real usage.
 */

/** Recursive helper used only within this file. */
export function countdown(n: number): number {
  return n <= 0 ? 0 : countdown(n - 1);
}

/** Used by another module — deleting this breaks consumer.ts. */
export function shared(): string {
  return 'shared value';
}
