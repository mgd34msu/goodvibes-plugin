/**
 * GV Tag Parser
 *
 * Parses structured <gv> JSON tags from agent output text.
 * Used by WRFC handlers to extract score, files, pass, count
 * instead of regex-based parsing.
 */

/** Parsed fields from a <gv> tag. All optional — agents emit only what applies. */
export interface GvTagData {
  /** Review score (0-10), emitted by reviewer agents */
  score?: number;
  /** Whether the agent's work passed (reviewer: review passed, tester: tests passed) */
  pass?: boolean;
  /** Files modified/reviewed, emitted by engineer/deployer/integrator agents */
  files?: string[];
  /** Count of items (e.g., test count), emitted by tester agents */
  count?: number;
  /** Any additional fields the agent included */
  [key: string]: unknown;
}

/** Result of parsing — includes raw JSON for logging */
export interface GvParseResult {
  /** Whether a <gv> tag was found and parsed successfully */
  found: boolean;
  /** Parsed data, or null if not found/invalid */
  data: GvTagData | null;
  /** Raw JSON string from inside the tag, for debugging */
  raw?: string;
}

/**
 * Regex to find <gv>...</gv> tags.
 * Uses a character-class exclusion `[^<]` to prevent matching across nested tags:
 * `[^<]*` matches any character except `<`, which stops at the first `<` inside
 * the tag content. This avoids false matches when a `<gv>` tag appears inside
 * another XML-like element, or when the text contains literal `<` characters.
 * Known limitation: if a JSON value contains a literal `<` character (e.g. in a
 * string comparison), the match will truncate. This is acceptable because <gv>
 * tags contain structured JSON with no reason to embed raw `<`.
 */
const GV_TAG_REGEX = /<gv>([^<]*)<\/gv>/;

/** Known <gv> tag fields — anything else goes to the index signature. */
const KNOWN_FIELDS = new Set(['score', 'pass', 'files', 'count']);

/**
 * Parses a raw JSON string into GvTagData.
 * Shared by parseGvTag and parseAllGvTags.
 */
function parseRawJson(raw: string): GvParseResult {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { found: true, data: null, raw };
    }
    const data: GvTagData = {};
    if (typeof parsed.score === 'number') {
      data.score = Math.max(0, Math.min(10, parsed.score));
    }
    if (typeof parsed.pass === 'boolean') data.pass = parsed.pass;
    if (Array.isArray(parsed.files)) {
      data.files = parsed.files.filter((f): f is string => typeof f === 'string');
    }
    if (typeof parsed.count === 'number') data.count = parsed.count;
    for (const [key, value] of Object.entries(parsed)) {
      if (!KNOWN_FIELDS.has(key)) {
        data[key] = value;
      }
    }
    return { found: true, data, raw };
  } catch {
    return { found: true, data: null, raw };
  }
}

/**
 * Parses the first <gv> JSON tag found in text.
 *
 * @param text - Raw output text from an agent
 * @returns Parse result with found flag, data, and raw JSON
 */
export function parseGvTag(text: string | undefined | null): GvParseResult {
  if (!text) return { found: false, data: null };

  const match = text.match(GV_TAG_REGEX);
  if (!match) return { found: false, data: null };

  const raw = match[1].trim();
  return parseRawJson(raw);
}

/**
 * Extracts all <gv> tags from text (for cases where multiple are present).
 *
 * @param text - Raw output text from an agent
 * @returns Array of parse results
 */
export function parseAllGvTags(text: string | undefined | null): GvParseResult[] {
  if (!text) return [];

  const GV_TAG_REGEX_GLOBAL = /<gv>([^<]*)<\/gv>/g;
  const results: GvParseResult[] = [];
  let match: RegExpExecArray | null;

  while ((match = GV_TAG_REGEX_GLOBAL.exec(text)) !== null) {
    const raw = match[1].trim();
    results.push(parseRawJson(raw));
  }

  return results;
}

/**
 * Convenience: extracts review score from agent output.
 * Tries <gv> tag first, falls back to regex for backward compatibility.
 *
 * @param text - Raw output text from a reviewer agent
 * @returns Parsed score (0-10), or null if not found
 */
export function extractReviewScore(text: string | undefined | null): number | null {
  // Try <gv> tag first
  const result = parseGvTag(text);
  if (result.found && result.data?.score !== undefined) {
    return result.data.score;
  }

  // Fallback: legacy regex
  if (!text) return null;
  const SCORE_REGEX = /SCORE:\s*(\d+(?:\.\d+)?)\/10/i;
  const match = text.match(SCORE_REGEX);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Convenience: extracts files list from agent output.
 *
 * @param text - Raw output text from an engineer/deployer agent
 * @returns Array of file paths, or empty array if not found
 */
export function extractFiles(text: string | undefined | null): string[] {
  const result = parseGvTag(text);
  if (result.found && result.data?.files) {
    return result.data.files;
  }
  return [];
}

/**
 * Convenience: extracts test results from agent output.
 *
 * @param text - Raw output text from a tester agent
 * @returns Object with pass and count, or null if not found
 */
export function extractTestResults(text: string | undefined | null): { pass: boolean; count: number } | null {
  const result = parseGvTag(text);
  if (result.found && result.data?.pass !== undefined) {
    return {
      pass: result.data.pass,
      count: result.data.count ?? 0,
    };
  }
  return null;
}
