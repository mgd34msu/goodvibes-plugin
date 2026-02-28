/**
 * String validation utilities.
 */

/**
 * Common email format validation.
 * Returns true if the string matches a common email address format.
 * Note: this is an approximation and does not enforce RFC 5322 length limits
 * or all edge cases (e.g. quoted strings, IP address literals).
 */
export function isEmail(str: string): boolean {
  // Regex covering common valid email formats (not full RFC 5322)
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return emailRegex.test(str);
}

/**
 * URL validation using the URL constructor (WHATWG URL Standard).
 * Returns true for valid http or https URLs.
 */
export function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns true if the string is empty (zero length) or contains only whitespace.
 */
export function isEmpty(str: string): boolean {
  return str.trim().length === 0;
}

/**
 * Returns true if the string reads the same forwards and backwards (case-insensitive,
 * ignoring non-alphanumeric characters).
 */
export function isPalindrome(str: string): boolean {
  const normalized = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const len = normalized.length;
  if (len === 0) return true;
  let lo = 0;
  let hi = len - 1;
  while (lo < hi) {
    if (normalized[lo] !== normalized[hi]) return false;
    lo++;
    hi--;
  }
  return true;
}

/**
 * Returns true if the string represents a finite number.
 * Accepts integers, decimals, and leading/trailing whitespace.
 * Rejects empty strings.
 */
export function isNumeric(str: string): boolean {
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  const n = Number(trimmed);
  return !Number.isNaN(n) && Number.isFinite(n);
}
