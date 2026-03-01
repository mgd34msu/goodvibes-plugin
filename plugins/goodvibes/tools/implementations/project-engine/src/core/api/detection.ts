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
 * Ordered list of frameworks to check during detection.
 *
 * Priority is determined by position: first match wins.
 * This list is configurable — reorder or extend to change detection priority.
 */
export const FRAMEWORK_DETECTION_PRIORITY: Array<{ framework: Framework; packageName: string }> = [
  { framework: 'nextjs', packageName: 'next' },
  { framework: 'hono', packageName: 'hono' },
  { framework: 'fastify', packageName: 'fastify' },
  { framework: 'express', packageName: 'express' },
];

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

    // Check frameworks in priority order (configurable via FRAMEWORK_DETECTION_PRIORITY)
    for (const { framework, packageName } of FRAMEWORK_DETECTION_PRIORITY) {
      if (allDeps[packageName]) {
        return framework;
      }
    }

    return null;
  } catch {
    return null;
  }
}
