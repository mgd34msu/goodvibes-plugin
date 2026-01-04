/**
 * Stack Detector
 *
 * Detects frameworks, package manager, and TypeScript configuration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LOCKFILES, fileExistsAsync } from '../shared.js';
import { debug } from '../shared/logging.js';

/** Module-level cache for stack detection results */
const stackCache = new Map<string, { result: StackInfo; timestamp: number }>();

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

const STACK_INDICATORS: Record<string, string> = {
  'next.config': 'Next.js',
  'nuxt.config': 'Nuxt',
  'svelte.config': 'SvelteKit',
  'astro.config': 'Astro',
  'remix.config': 'Remix',
  'vite.config': 'Vite',
  'angular.json': 'Angular',
  'vue.config': 'Vue CLI',
  'prisma/schema.prisma': 'Prisma',
  'drizzle.config': 'Drizzle',
  'tailwind.config': 'Tailwind CSS',
  'vitest.config': 'Vitest',
  'jest.config': 'Jest',
  'playwright.config': 'Playwright',
  'turbo.json': 'Turborepo',
  'pnpm-workspace.yaml': 'pnpm workspaces',
  'tsconfig.json': 'TypeScript',
};

const LOCKFILE_TO_PM: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'bun.lockb': 'bun',
};

/** Detected technology stack information. */
export interface StackInfo {
  frameworks: string[];
  packageManager: string | null;
  hasTypeScript: boolean;
  isStrict: boolean;
}

/** Detect the technology stack used in the project. */
export async function detectStack(cwd: string): Promise<StackInfo> {
  // Check cache first
  const cached = stackCache.get(cwd);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.result;
  }

  const frameworks: string[] = [];
  let packageManager: string | null = null;
  let hasTypeScript = false;
  let isStrict = false;

  // Check for framework indicators
  for (const [indicator, name] of Object.entries(STACK_INDICATORS)) {
    const checkPath = path.join(cwd, indicator);
    const checks = await Promise.all([
      fileExistsAsync(checkPath),
      fileExistsAsync(checkPath + '.js'),
      fileExistsAsync(checkPath + '.ts'),
      fileExistsAsync(checkPath + '.mjs'),
    ]);

    if (checks.some(exists => exists)) {
      frameworks.push(name);
      if (name === 'TypeScript') hasTypeScript = true;
    }
  }

  // Check lockfiles for package manager
  for (const lockfile of LOCKFILES) {
    if (await fileExistsAsync(path.join(cwd, lockfile))) {
      packageManager = LOCKFILE_TO_PM[lockfile];
      break;
    }
  }

  // Check tsconfig for strict mode
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (await fileExistsAsync(tsconfigPath)) {
    try {
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);
      isStrict = config.compilerOptions?.strict === true;
    } catch (error) {
      // tsconfig.json might have comments or invalid JSON - ignore parse errors
      debug('stack-detector: Failed to parse tsconfig.json', error);
    }
  }

  const result = { frameworks, packageManager, hasTypeScript, isStrict };

  // Store in cache
  stackCache.set(cwd, { result, timestamp: now });

  return result;
}

/** Format stack information for display in context output. */
export function formatStackInfo(info: StackInfo): string {
  if (!info || typeof info !== 'object') {
    return '';
  }

  const parts: string[] = [];

  if (info.frameworks && info.frameworks.length > 0) {
    parts.push(`Stack: ${info.frameworks.join(', ')}`);
  }

  if (info.hasTypeScript) {
    parts.push(`TypeScript: ${info.isStrict ? 'strict' : 'not strict'}`);
  }

  if (info.packageManager) {
    parts.push(`Package Manager: ${info.packageManager}`);
  }

  return parts.join('\n');
}
