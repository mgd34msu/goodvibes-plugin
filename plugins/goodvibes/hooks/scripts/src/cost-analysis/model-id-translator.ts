/**
 * Model ID Translator
 *
 * Translates between API model IDs and cache keys.
 */

interface ParsedModelId {
  family: 'opus' | 'sonnet' | 'haiku';
  majorVersion: number;
  minorVersion: number;
  dateCode: string;
}

/**
 * Parses a full model ID into its components.
 * Pattern: claude-(opus|sonnet|haiku)-(\d+)-(\d+)-(\d{8})
 * @param fullModelId - Full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns Parsed components or null if invalid
 */
export function parseModelId(fullModelId: string): ParsedModelId | null {
  const pattern = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)-(\d{8})$/;
  const match = fullModelId.match(pattern);

  if (!match) {
    return null;
  }

  return {
    family: match[1] as 'opus' | 'sonnet' | 'haiku',
    majorVersion: parseInt(match[2], 10),
    minorVersion: parseInt(match[3], 10),
    dateCode: match[4],
  };
}

/**
 * Converts full model ID to cache key format.
 * @param fullModelId - Full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns Cache key (e.g., "claude-opus-4.5") or null if invalid
 */
export function toCacheKey(fullModelId: string): string | null {
  const parsed = parseModelId(fullModelId);
  if (!parsed) {
    return null;
  }

  return `claude-${parsed.family}-${parsed.majorVersion}.${parsed.minorVersion}`;
}

/**
 * Converts full model ID to display name.
 * @param fullModelId - Full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns Display name (e.g., "Opus 4.5") or the original ID if invalid
 */
export function toDisplayName(fullModelId: string): string {
  const parsed = parseModelId(fullModelId);
  if (!parsed) {
    return fullModelId;
  }

  const familyName = parsed.family.charAt(0).toUpperCase() + parsed.family.slice(1);
  return `${familyName} ${parsed.majorVersion}.${parsed.minorVersion}`;
}
