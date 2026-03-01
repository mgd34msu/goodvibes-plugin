/**
 * Text classification for registry-engine core layer (L1).
 * Category detection and complexity estimation from text signals.
 */

/**
 * Maps category names to the keywords that indicate them.
 * Used for detecting which domain a task description belongs to.
 */
export const CATEGORY_MAP: Record<string, string[]> = {
  authentication: ['auth', 'login'],
  database: ['database', 'prisma', 'sql'],
  api: ['api', 'endpoint'],
  styling: ['style', 'css', 'tailwind'],
  testing: ['test'],
  deployment: ['deploy', 'build'],
};

/**
 * Detect the category of a text string by checking against CATEGORY_MAP keywords.
 *
 * @param text - Input text (lowercased or not — comparison is case-insensitive)
 * @returns The matched category name, or 'general' if no match found
 */
export function detectCategory(text: string): string {
  const textLower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(kw => textLower.includes(kw))) {
      return category;
    }
  }
  return 'general';
}

/**
 * Estimate the complexity of a task based on keyword count.
 * - > 10 keywords: complex
 * - > 5 keywords: moderate
 * - otherwise: simple
 *
 * @param keywords - Array of keywords extracted from a task description
 * @returns Complexity level: 'simple', 'moderate', or 'complex'
 */
export function estimateComplexity(keywords: string[]): 'simple' | 'moderate' | 'complex' {
  if (keywords.length > 10) return 'complex';
  if (keywords.length > 5) return 'moderate';
  return 'simple';
}
