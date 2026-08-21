/**
 * Framework detection for `api_routes` / `api_spec` / `api_validate`.
 *
 * Ported near-verbatim from v1 project-engine `core/api/detection.ts`, reads
 * package.json dependencies/devDependencies and returns the first framework
 * match in priority order.
 *
 * @module lib/api/detection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Framework } from './types.js';

/**
 * Ordered list of frameworks to check during detection. Priority is
 * determined by position: first match wins.
 */
export const FRAMEWORK_DETECTION_PRIORITY: Array<{ framework: Framework; packageName: string }> = [
  { framework: 'nextjs', packageName: 'next' },
  { framework: 'hono', packageName: 'hono' },
  { framework: 'fastify', packageName: 'fastify' },
  { framework: 'express', packageName: 'express' },
];

/**
 * Detect the web framework used in a project by examining package.json
 * dependencies. Priority: Next.js > Hono > Fastify > Express.
 * @param projectPath - absolute path to the project root
 * @returns the detected framework, or null if none of the known ones are found
 */
export function detectFramework(projectPath: string): Framework | null {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {return null;}

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const { framework, packageName } of FRAMEWORK_DETECTION_PRIORITY) {
      if (allDeps[packageName]) {return framework;}
    }
    return null;
  } catch {
    return null;
  }
}
