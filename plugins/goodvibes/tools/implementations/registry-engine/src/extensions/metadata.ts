/**
 * Skill metadata loading orchestration.
 *
 * L2 orchestration layer — decomposes parseSkillMetadata (monolithic, 80 lines)
 * into a multi-step workflow:
 *   resolveSkillPath → readFile → parseFrontmatter || (extractMarkdownMetadata + extractTechKeywords)
 *
 * Renamed from parseSkillMetadata — 'load' clarifies this does I/O, not pure parsing.
 *
 * @module extensions/metadata
 */

import * as fs from 'node:fs/promises';
import { SkillMetadata } from '../core/types.js';
import { resolveSkillPath } from '../core/resolution.js';
import { parseFrontmatter, extractMarkdownMetadata, extractTechKeywords } from '../core/parsing.js';

/**
 * Load and parse metadata for a skill at the given path.
 *
 * Orchestrates: resolveSkillPath → readFile → parseFrontmatter
 * with fallback to extractMarkdownMetadata + extractTechKeywords.
 *
 * Returns empty object if skill is not found or cannot be read.
 */
export async function loadSkillMetadata(skillPath: string): Promise<SkillMetadata> {
  const resolved = await resolveSkillPath(skillPath);
  if (!resolved) {
    return {};
  }

  try {
    const content = await fs.readFile(resolved, 'utf-8');

    // Try YAML frontmatter first
    const frontmatter = parseFrontmatter(content);
    if (frontmatter) {
      return {
        requires: Array.isArray(frontmatter.requires) ? frontmatter.requires : undefined,
        complements: Array.isArray(frontmatter.complements) ? frontmatter.complements :
                    Array.isArray(frontmatter.related) ? frontmatter.related : undefined,
        conflicts: Array.isArray(frontmatter.conflicts) ? frontmatter.conflicts : undefined,
        category: typeof frontmatter.category === 'string' ? frontmatter.category : undefined,
        technologies: Array.isArray(frontmatter.technologies) ? frontmatter.technologies :
                     Array.isArray(frontmatter.tech) ? frontmatter.tech : undefined,
        difficulty: typeof frontmatter.difficulty === 'string' ? frontmatter.difficulty : undefined,
      };
    }

    // Fallback to markdown section parsing
    const markdownMeta = extractMarkdownMetadata(content);
    const technologies = markdownMeta.technologies?.length
      ? markdownMeta.technologies
      : extractTechKeywords(content);

    return {
      requires: markdownMeta.requires,
      complements: markdownMeta.complements,
      technologies,
    };
  } catch {
    return {};
  }
}
