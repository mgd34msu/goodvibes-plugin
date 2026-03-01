/**
 * Framework detection for the api domain.
 *
 * Detects which web framework a project uses by examining package.json.
 *
 * @module core/api/detection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Framework } from './types.js';

/**
 * Detects the web framework used in a project by examining package.json dependencies.
 *
 * Checks dependencies and devDependencies for known framework packages.
 * Priority: Next.js > Hono > Fastify > Express.
 *
 * @param projectPath - Absolute path to the project root
 * @returns The detected framework type, or null if no supported framework is found
 *
 * @example
 * ```typescript
 * const fw = detectFramework('/home/user/my-project');
 * // Returns 'nextjs' | 'express' | 'fastify' | 'hono' | null
 * ```
 */
export function detectFramework(projectPath: string): Framework | null {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for Next.js first (most common)
    if (allDeps['next']) {
      return 'nextjs';
    }

    // Check for Hono
    if (allDeps['hono']) {
      return 'hono';
    }

    // Check for Fastify
    if (allDeps['fastify']) {
      return 'fastify';
    }

    // Check for Express
    if (allDeps['express']) {
      return 'express';
    }

    return null;
  } catch {
    return null;
  }
}
