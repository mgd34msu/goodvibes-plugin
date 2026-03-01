/**
 * Content parsing for registry-engine core layer (L1).
 * Pure functions for parsing YAML frontmatter and extracting metadata from markdown.
 */

import * as yaml from 'js-yaml';

/**
 * Known technology keywords for extracting tech mentions from skill content.
 */
const TECH_KEYWORDS = [
  'react', 'next', 'nextjs', 'prisma', 'drizzle', 'tailwind',
  'typescript', 'node', 'express', 'vite', 'vitest', 'jest',
  'zustand', 'zod', 'trpc',
];

/**
 * Parse YAML frontmatter from markdown content.
 * Extracts the block between opening and closing `---` markers.
 *
 * @param content - Raw file content
 * @returns Parsed frontmatter as a plain object, or null if no frontmatter found
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;
  try {
    return yaml.load(frontmatterMatch[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract metadata from markdown content sections as a regex fallback
 * when no YAML frontmatter is present.
 *
 * Looks for "Requires:"/"Prerequisites:"/"Dependencies:", "Related:"/"See also:"/"Complements:"
 * sections with bulleted lists.
 *
 * @param content - Raw file content
 * @returns Partial metadata object with requires, complements, and technologies fields
 */
export function extractMarkdownMetadata(content: string): {
  requires?: string[];
  complements?: string[];
  technologies?: string[];
} {
  const metadata: {
    requires?: string[];
    complements?: string[];
    technologies?: string[];
  } = {};

  // Look for "Requires:" or "Prerequisites:" sections
  const requiresMatch = content.match(/(?:Requires|Prerequisites|Dependencies):\s*\n((?:\s*-\s*.+\n)+)/i);
  if (requiresMatch) {
    const items = requiresMatch[1].match(/-\s*(.+)/g);
    if (items) {
      metadata.requires = items.map(m => m.replace(/^-\s*/, '').trim());
    } else {
      metadata.requires = [];
    }
  }

  // Look for "Related:" or "See also:" sections
  const relatedMatch = content.match(/(?:Related|See also|Complements):\s*\n((?:\s*-\s*.+\n)+)/i);
  if (relatedMatch) {
    const items = relatedMatch[1].match(/-\s*(.+)/g);
    if (items) {
      metadata.complements = items.map(m => m.replace(/^-\s*/, '').trim());
    } else {
      metadata.complements = [];
    }
  }

  // Extract technologies from content
  metadata.technologies = extractTechKeywords(content);

  return metadata;
}

/**
 * Extract technology keywords mentioned in the content.
 *
 * @param content - Raw file content
 * @returns Array of matching technology keywords found in content
 */
export function extractTechKeywords(content: string): string[] {
  const contentLower = content.toLowerCase();
  return TECH_KEYWORDS.filter(t => contentLower.includes(t));
}

/**
 * Extract meaningful keywords from a text string.
 * Splits on whitespace, lowercases, and filters to words longer than 3 characters.
 *
 * @param text - Input text to extract keywords from
 * @returns Array of keyword strings
 */
export function extractKeywords(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
}
