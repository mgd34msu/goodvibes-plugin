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
export declare function parseModelId(fullModelId: string): ParsedModelId | null;
/**
 * Converts full model ID to cache key format.
 * @param fullModelId - Full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns Cache key (e.g., "claude-opus-4.5") or null if invalid
 */
export declare function toCacheKey(fullModelId: string): string | null;
/**
 * Converts full model ID to display name.
 * @param fullModelId - Full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns Display name (e.g., "Opus 4.5") or the original ID if invalid
 */
export declare function toDisplayName(fullModelId: string): string;
export {};
