/**
 * UTF-8-safe string slicing.
 *
 * JavaScript strings are sequences of UTF-16 code units; an astral character
 * (emoji, some CJK) occupies a surrogate pair of two units. Slicing between the
 * high and low surrogate produces a lone surrogate that serializes to the U+FFFD
 * replacement character and corrupts multibyte content. These helpers never cut
 * a surrogate pair, so a truncated payload is always valid text.
 */

/** Byte length of a string when encoded as UTF-8. */
export function utf8ByteLength(input: string): number {
  return Buffer.byteLength(input, 'utf8');
}

/**
 * Return at most `maxUnits` UTF-16 code units of `input` without splitting a
 * surrogate pair. If the boundary would land between a high and low surrogate,
 * the trailing high surrogate is dropped.
 *
 * @param input - source string
 * @param maxUnits - maximum number of UTF-16 code units to keep
 * @returns the truncated string (never longer than `input`)
 */
export function utf8SafeSlice(input: string, maxUnits: number): string {
  if (maxUnits <= 0) {return '';}
  if (input.length <= maxUnits) {return input;}

  let end = maxUnits;
  const lastKept = input.charCodeAt(end - 1);
  // A high surrogate at the boundary means its low surrogate sits at `end`
  // (or beyond) and would be severed — drop the high surrogate too.
  if (lastKept >= 0xd800 && lastKept <= 0xdbff) {
    end -= 1;
  }
  return input.slice(0, end);
}

/**
 * Truncate a string to fit within a UTF-8 byte budget without splitting a
 * surrogate pair or a multibyte sequence. Used by the size gate for
 * byte-accurate reads.
 *
 * @param input - source string
 * @param maxBytes - maximum UTF-8 byte length to keep
 * @returns the truncated string whose UTF-8 encoding is at most `maxBytes`
 */
export function utf8SafeSliceBytes(input: string, maxBytes: number): string {
  if (maxBytes <= 0) {return '';}
  if (utf8ByteLength(input) <= maxBytes) {return input;}

  // Binary search the largest prefix (in code units) that fits the byte budget.
  let lo = 0;
  let hi = input.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (utf8ByteLength(utf8SafeSlice(input, mid)) <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return utf8SafeSlice(input, lo);
}
