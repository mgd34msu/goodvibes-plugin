/**
 * Parser Module for Explain Codebase
 *
 * Contains file system scanning and parsing functions for analyzing
 * codebase structure, detecting key files, and finding entry points.
 *
 * @module handlers/docs/explain-codebase/parser
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';

import { fileExists } from '../../../utils.js';
import type { KeyFile, PackageJsonData } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Key file patterns with importance levels
 */
export const KEY_FILE_PATTERNS: Array<{
  pattern: RegExp;
  importance: 'critical' | 'high' | 'medium';
  purpose: string;
}> = [
  // Entry points - Critical
  { pattern: /^src\/(index|main|app)\.(ts|js|tsx|jsx)$/, importance: 'critical', purpose: 'Application entry point' },
  { pattern: /^(index|main|app)\.(ts|js|tsx|jsx)$/, importance: 'critical', purpose: 'Application entry point' },
  { pattern: /^src\/server\.(ts|js)$/, importance: 'critical', purpose: 'Server entry point' },
  { pattern: /^server\.(ts|js)$/, importance: 'critical', purpose: 'Server entry point' },

  // Next.js specific - Critical
  { pattern: /^app\/layout\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js root layout' },
  { pattern: /^app\/page\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js home page' },
  { pattern: /^pages\/_app\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js app wrapper' },
  { pattern: /^pages\/index\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js home page' },

  // Configuration - Critical
  { pattern: /^next\.config\.(js|mjs|ts)$/, importance: 'critical', purpose: 'Next.js configuration' },
  { pattern: /^vite\.config\.(ts|js)$/, importance: 'critical', purpose: 'Vite configuration' },
  { pattern: /schema\.prisma$/, importance: 'critical', purpose: 'Prisma database schema' },

  // Routing - High
  { pattern: /^src\/(routes|router)\.(ts|js)$/, importance: 'high', purpose: 'Application routing' },
  { pattern: /^app\/api\/.*\/route\.(ts|js)$/, importance: 'high', purpose: 'API route handler' },

  // Configuration - High
  { pattern: /^(src\/)?(config|settings)\.(ts|js)$/, importance: 'high', purpose: 'Application configuration' },
  { pattern: /^tsconfig\.json$/, importance: 'high', purpose: 'TypeScript configuration' },
  { pattern: /^tailwind\.config\.(js|ts)$/, importance: 'high', purpose: 'Tailwind CSS configuration' },
  { pattern: /^drizzle\.config\.(ts|js)$/, importance: 'high', purpose: 'Drizzle ORM configuration' },

  // Auth - High
  { pattern: /^(src\/)?(auth|authentication)\.(ts|js)$/, importance: 'high', purpose: 'Authentication logic' },
  { pattern: /^(src\/)?lib\/auth\.(ts|js)$/, importance: 'high', purpose: 'Authentication utilities' },
  { pattern: /^(src\/)?middleware\.(ts|js)$/, importance: 'high', purpose: 'Request middleware' },

  // Database - High
  { pattern: /^(src\/)?lib\/db\.(ts|js)$/, importance: 'high', purpose: 'Database client setup' },
  { pattern: /^(src\/)?db\/(index|client)\.(ts|js)$/, importance: 'high', purpose: 'Database client' },

  // State management - Medium
  { pattern: /^(src\/)?store\/(index)?\.(ts|js)$/, importance: 'medium', purpose: 'State store configuration' },
  { pattern: /^(src\/)?context\/.*\.(tsx|ts)$/, importance: 'medium', purpose: 'React context provider' },

  // API - Medium
  { pattern: /^(src\/)?api\/(index|client)\.(ts|js)$/, importance: 'medium', purpose: 'API client setup' },
  { pattern: /^(src\/)?trpc\/.*\.(ts|js)$/, importance: 'medium', purpose: 'tRPC router/procedures' },

  // Types - Medium
  { pattern: /^(src\/)?types\/(index)?\.(ts|d\.ts)$/, importance: 'medium', purpose: 'Type definitions' },
];

/**
 * Directories to skip when scanning
 */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.svelte-kit', 'coverage', '.cache', '.turbo', '.vercel',
]);

/**
 * Maximum directory depth for structure scan
 */
export const MAX_STRUCTURE_DEPTH: Record<string, number> = {
  shallow: 2,
  medium: 3,
  deep: 4,
};

// =============================================================================
// Functions
// =============================================================================

/**
 * Get directory structure as a tree string
 */
export async function getDirectoryStructure(
  dir: string,
  baseDir: string,
  maxDepth: number,
  currentDepth: number = 0,
  prefix: string = '',
): Promise<string> {
  if (currentDepth >= maxDepth) return '';

  let result = '';

  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    const filtered = entries.filter(e => !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'));

    // Sort: directories first, then files
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '\\--' : '|--';
      const childPrefix = isLast ? '   ' : '|  ';

      result += `${prefix}${connector} ${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

      if (entry.isDirectory()) {
        const childDir = path.join(dir, entry.name);
        result += await getDirectoryStructure(
          childDir,
          baseDir,
          maxDepth,
          currentDepth + 1,
          prefix + childPrefix
        );
      }
    }
  } catch {
    // Directory read error, skip
  }

  return result;
}

/**
 * Find key files in the project
 */
export async function findKeyFiles(projectPath: string): Promise<KeyFile[]> {
  const keyFiles: KeyFile[] = [];

  async function scanDir(dir: string, relativePath: string = ''): Promise<void> {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });

      /* v8 ignore next -- loop body uncovered when entries is empty (coverage quirk) */
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await scanDir(fullPath, relPath);
          }
        } else {
          // Check against patterns
          for (const pattern of KEY_FILE_PATTERNS) {
            if (pattern.pattern.test(relPath)) {
              keyFiles.push({
                path: relPath,
                purpose: pattern.purpose,
                importance: pattern.importance,
              });
              break;
            }
          }
        }
      }
    } catch {
      // Directory read error, skip
    }
  }

  await scanDir(projectPath);

  // Sort by importance
  const importanceOrder = { critical: 0, high: 1, medium: 2 };
  keyFiles.sort((a, b) => importanceOrder[a.importance] - importanceOrder[b.importance]);

  return keyFiles;
}

/**
 * Find entry points in the project
 */
export async function findEntryPoints(projectPath: string, packageJson: PackageJsonData | null): Promise<string[]> {
  const entryPoints: string[] = [];

  // Check package.json main/module/exports
  if (packageJson) {
    const pkg = packageJson as Record<string, unknown>;
    if (typeof pkg.main === 'string') entryPoints.push(pkg.main);
    if (typeof pkg.module === 'string') entryPoints.push(pkg.module);

    // Check scripts for common entry patterns
    if (packageJson.scripts) {
      const scripts = packageJson.scripts;
      if (scripts.dev?.includes('next')) entryPoints.push('app/ (Next.js App Router)');
      if (scripts.dev?.includes('vite')) entryPoints.push('index.html / src/main.tsx');
      if (scripts.start?.includes('node')) {
        const match = scripts.start.match(/node\s+(\S+)/);
        if (match) entryPoints.push(match[1]);
      }
    }
  }

  // Check for common entry files
  const commonEntries = [
    'src/index.ts', 'src/index.tsx', 'src/main.ts', 'src/main.tsx',
    'src/app.ts', 'src/app.tsx', 'app/page.tsx', 'pages/index.tsx',
    'index.ts', 'index.js', 'server.ts', 'server.js',
  ];

  for (const entry of commonEntries) {
    if (await fileExists(path.join(projectPath, entry))) {
      if (!entryPoints.includes(entry)) {
        entryPoints.push(entry);
      }
    }
  }

  return Array.from(new Set(entryPoints));
}

/**
 * Generate a hash of key project files for cache invalidation
 */
export async function generateProjectHash(projectPath: string): Promise<string> {
  const filesToHash = [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'tsconfig.json',
  ];

  let hashContent = '';

  for (const file of filesToHash) {
    const filePath = path.join(projectPath, file);
    try {
      const stat = await fsPromises.stat(filePath);
      hashContent += `${file}:${stat.mtimeMs}:${stat.size};`;
    } catch {
      // File doesn't exist, skip
    }
  }

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashContent.length; i++) {
    const char = hashContent.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return hash.toString(36);
}
