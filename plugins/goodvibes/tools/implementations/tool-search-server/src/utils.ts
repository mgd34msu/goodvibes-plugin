/**
 * Utility functions for GoodVibes MCP Server
 */

import Fuse from 'fuse.js';
import * as yaml from 'js-yaml';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';

import { Registry, RegistryEntry, SearchResult } from './types.js';
import { PLUGIN_ROOT, FUSE_OPTIONS } from './config.js';

const execAsync = promisify(exec);

/**
 * Check if a file exists asynchronously.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to true if file exists
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
      console.error(`Registry not found: ${fullPath}`);
      return null;
    }
    const content = await fsPromises.readFile(fullPath, 'utf-8');
    return yaml.load(content) as Registry;
  } catch (error) {
    console.error(`Error loading registry ${registryPath}:`, error);
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
 * Safely read JSON file
 */
export async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fileExists(filePath))) {
      return null;
    }
    const content = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Execute command safely with timeout
 */
export async function safeExec(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (caughtError: unknown) {
    const execError = caughtError as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      error: execError.message || 'Command failed',
    };
  }
}

/**
 * Detect package manager in use
 */
export async function detectPackageManager(projectPath: string): Promise<string> {
  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (await fileExists(path.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Fetch URL content
 */
export function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Create a successful tool response
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
 * Create an error tool response
 */
export function error(message: string): { content: Array<{ type: string; text: string }>; isError: boolean } {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
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
        metadata.requires = requiresMatch[1].match(/-\s*(.+)/g)?.map(m => m.replace(/^-\s*/, '').trim()) || [];
      }

      // Look for "Related:" or "See also:" sections
      const relatedMatch = content.match(/(?:Related|See also|Complements):\s*\n((?:\s*-\s*.+\n)+)/i);
      if (relatedMatch) {
        metadata.complements = relatedMatch[1].match(/-\s*(.+)/g)?.map(m => m.replace(/^-\s*/, '').trim()) || [];
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

/**
 * Extract function body from content starting at index
 */
export function extractFunctionBody(content: string, startIndex: number): string {
  let braceCount = 0;
  let started = false;
  let endIndex = startIndex;

  for (let i = startIndex; i < content.length && i < startIndex + 2000; i++) {
    if (content[i] === '{') {
      braceCount++;
      started = true;
    } else if (content[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  return content.substring(startIndex, endIndex);
}

/**
 * Extract validation patterns from skill content
 */
export async function extractSkillPatterns(skillPath: string): Promise<{
  required_imports?: string[];
  must_include?: string[];
  must_not_include?: string[];
}> {
  const patterns: {
    required_imports?: string[];
    must_include?: string[];
    must_not_include?: string[];
  } = {};

  const attempts = [
    path.join(PLUGIN_ROOT, 'skills', skillPath, 'SKILL.md'),
    path.join(PLUGIN_ROOT, 'skills', skillPath + '.md'),
    path.join(PLUGIN_ROOT, 'skills', skillPath),
  ];

  for (const filePath of attempts) {
    try {
      await fsPromises.access(filePath);
      const content = await fsPromises.readFile(filePath, 'utf-8');

      // Look for Required imports section
      const importsMatch = content.match(/(?:Required imports|Must import):\s*\n((?:\s*-\s*.+\n)+)/i);
      if (importsMatch) {
        patterns.required_imports = importsMatch[1].match(/-\s*(.+)/g)?.map(m =>
          m.replace(/^-\s*/, '').replace(/[`'"]/g, '').trim()
        );
      }

      // Look for code block patterns that should be included
      const codeBlocks = content.match(/```(?:typescript|javascript|tsx|jsx)?\n([\s\S]*?)```/g);
      if (codeBlocks && codeBlocks.length > 0) {
        for (const block of codeBlocks.slice(0, 3)) {
          const code = block.replace(/```\w*\n?/g, '');
          const imports = code.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
          if (imports) {
            patterns.required_imports = patterns.required_imports || [];
            for (const imp of imports) {
              const pkg = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1];
              if (pkg && !pkg.startsWith('.') && !patterns.required_imports.includes(pkg)) {
                patterns.required_imports.push(pkg);
              }
            }
          }
        }
      }

      // Look for "Avoid" or "Don't" patterns
      const avoidMatch = content.match(/(?:Avoid|Don't|Do not|Never):\s*\n((?:\s*-\s*.+\n)+)/i);
      if (avoidMatch) {
        patterns.must_not_include = avoidMatch[1].match(/-\s*(.+)/g)?.map(m =>
          m.replace(/^-\s*/, '').replace(/[`'"]/g, '').trim()
        );
      }

      return patterns;
    } catch {
      // File doesn't exist or read error, try next path
      continue;
    }
  }

  return patterns;
}
