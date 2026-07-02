/**
 * Internal module: exported, but NOT re-exported from the entry point, so it is
 * part of the internal surface rather than the public one.
 */

/** A helper the public API does not re-export. */
export function internalHelper(): string {
  return 'internal';
}
