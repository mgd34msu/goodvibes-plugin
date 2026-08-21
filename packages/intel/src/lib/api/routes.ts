/**
 * `api_routes` orchestration, framework-dispatch route scanning.
 *
 * Ported from v1 project-engine `extensions/api/routes.ts`, rewired per §3.3:
 * file discovery rides the shared intel compiler host's `findSourceFiles`
 * (one skip-directory policy shared with every other analyzer) instead of the
 * v1 bespoke recursive walker. Every route echoes an absolute `resolved_path`
 * (issue 1 fix #3) alongside a `base_path`-relative `handler_file`.
 *
 * @module lib/api/routes
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { findSourceFiles, makeRelativePath } from '../../host/index.js';
import type { ApiRoute, Framework } from './types.js';
import { parseExpressFileRoutes } from './parsers/express.js';
import { parseFastifyFileRoutes } from './parsers/fastify.js';
import { parseHonoFileRoutes } from './parsers/hono.js';
import { parseNextJsAppRouterFile, parseNextJsPagesRouterFile } from './parsers/nextjs.js';

export type { Framework } from './types.js';

type ParseFile = (content: string, filePath: string, resolvedPath: string) => ApiRoute[];

/** Express/Fastify/Hono are regex-scanned over `.ts`/`.js` only (mirrors v1; excludes `.d.ts`). */
const SCAN_EXT = /\.(ts|js)$/;

async function existsDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function scanGenericFramework(
  absTarget: string,
  baseDir: string,
  parseFile: ParseFile,
  signal?: { aborted: boolean },
): Promise<ApiRoute[]> {
  const srcDir = path.join(absTarget, 'src');
  const searchDirs = (await existsDir(srcDir)) ? [srcDir] : [absTarget];

  const routes: ApiRoute[] = [];
  for (const dir of searchDirs) {
    const files = (await findSourceFiles(dir)).filter((f) => SCAN_EXT.test(f) && !f.endsWith('.d.ts'));
    for (const file of files) {
      if (signal?.aborted) {return routes;}
      const content = await fs.readFile(file, 'utf-8').catch(() => null);
      if (content === null) {continue;}
      const relativePath = makeRelativePath(file, baseDir);
      routes.push(...parseFile(content, relativePath, file));
    }
  }
  return routes;
}

async function scanNextJs(absTarget: string, baseDir: string, signal?: { aborted: boolean }): Promise<ApiRoute[]> {
  const routes: ApiRoute[] = [];

  // App Router: prefer src/app/api, else app/api.
  for (const dir of [path.join(absTarget, 'src', 'app', 'api'), path.join(absTarget, 'app', 'api')]) {
    if (!(await existsDir(dir))) {continue;}
    const files = (await findSourceFiles(dir)).filter((f) => /route\.(ts|tsx|js|jsx)$/.test(f));
    for (const file of files) {
      if (signal?.aborted) {return routes;}
      const content = await fs.readFile(file, 'utf-8').catch(() => null);
      if (content === null) {continue;}
      routes.push(...parseNextJsAppRouterFile(content, makeRelativePath(file, baseDir), file));
    }
    break;
  }

  // Pages Router: prefer src/pages/api, else pages/api.
  for (const dir of [path.join(absTarget, 'src', 'pages', 'api'), path.join(absTarget, 'pages', 'api')]) {
    if (!(await existsDir(dir))) {continue;}
    const files = (await findSourceFiles(dir)).filter(
      (f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/route\.(ts|tsx|js|jsx)$/.test(f),
    );
    for (const file of files) {
      if (signal?.aborted) {return routes;}
      const content = await fs.readFile(file, 'utf-8').catch(() => null);
      if (content === null) {continue;}
      routes.push(...parseNextJsPagesRouterFile(content, makeRelativePath(file, baseDir), file));
    }
    break;
  }

  return routes;
}

/**
 * Scan a project directory for API routes of the given framework.
 * @param absTarget - absolute directory to scan
 * @param baseDir - absolute base_path; `handler_file` is reported relative to it
 * @param framework - the framework to parse routes for
 * @param signal - optional cooperative budget signal; scanning stops early when aborted
 */
export async function scanFrameworkRoutes(
  absTarget: string,
  baseDir: string,
  framework: Framework,
  signal?: { aborted: boolean },
): Promise<ApiRoute[]> {
  switch (framework) {
    case 'nextjs':
      return scanNextJs(absTarget, baseDir, signal);
    case 'express':
      return scanGenericFramework(absTarget, baseDir, parseExpressFileRoutes, signal);
    case 'fastify':
      return scanGenericFramework(absTarget, baseDir, parseFastifyFileRoutes, signal);
    case 'hono':
      return scanGenericFramework(absTarget, baseDir, parseHonoFileRoutes, signal);
    default:
      return [];
  }
}
