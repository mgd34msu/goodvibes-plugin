/**
 * Utility functions for Registry Engine MCP Server
 */

import Fuse from 'fuse.js';
import * as yaml from 'js-yaml';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

import { Registry, RegistryEntry, SearchResult } from './types.js';
import { PLUGIN_ROOT, FUSE_OPTIONS } from './config.js';
import { logger } from './logging.js';

/**
 * Check if a file exists asynchronously.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load registry from YAML file
 */
export async function loadRegistry(registryPath: string): Promise<Registry | null> {
  try {
    const fullPath = path.join(PLUGIN_ROOT, registryPath);
    if (!(await fileExists(fullPath))) {
      logger.error(`Registry not found: ${fullPath}`);
      return null;
    }
    const content = await fsPromises.readFile(fullPath, 'utf-8');
    return yaml.load(content) as Registry;
  } catch (error: unknown) {
    logger.error(`Error loading registry ${registryPath}`, error);
    return null;
  }
}

/**
 * Create Fuse index from registry
 */
export function createIndex(registry: Registry | null): Fuse<RegistryEntry> | null {
  if (!registry || !registry.search_index) return null;
  return new Fuse(registry.search_index, FUSE_OPTIONS);
}

/**
 * Perform search and return formatted results
 */
export function search(
  index: Fuse<RegistryEntry> | null,
  query: string,
  limit: number = 5
): SearchResult[] {
  if (!index) return [];

  const results = index.search(query, { limit });
  return results.map((r) => ({
    name: r.item.name,
    path: r.item.path,
    description: r.item.description,
    relevance: Math.round((1 - (r.score || 0)) * 100) / 100,
  }));
}

/**
 * Parse skill metadata from YAML frontmatter
 */
export async function parseSkillMetadata(skillPath: string): Promise<{
  requires?: string[];
  complements?: string[];
  conflicts?: string[];
  category?: string;
  technologies?: string[];
  difficulty?: string;
}> {
  const attempts = [
    path.join(PLUGIN_ROOT, 'skills', skillPath, 'SKILL.md'),
    path.join(PLUGIN_ROOT, 'skills', skillPath + '.md'),
    path.join(PLUGIN_ROOT, 'skills', skillPath),
  ];

  for (const filePath of attempts) {
    if (!(await fileExists(filePath))) {
      continue;
    }

    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');

      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;
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

      // Try to extract metadata from content if no frontmatter
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
      const techKeywords = ['react', 'next', 'nextjs', 'prisma', 'drizzle', 'tailwind', 'typescript', 'node', 'express', 'vite', 'vitest', 'jest', 'zustand', 'zod', 'trpc'];
      const contentLower = content.toLowerCase();
      metadata.technologies = techKeywords.filter(t => contentLower.includes(t));

      return metadata;
    } catch {
      // Read or parse error, try next path
      continue;
    }
  }

  return {};
}

// =============================================================================
// Response Utilities
// =============================================================================

/**
 * Create a successful tool response.
 */
export function success(data: unknown): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{
      type: 'text',
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    }],
  };
}

/**
 * Create an error tool response.
 */
export function error(message: string): { content: Array<{ type: string; text: string }>; isError: boolean } {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
