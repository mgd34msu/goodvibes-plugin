/**
 * Get API Surface Extension
 *
 * L2 orchestration function that composes L1 entry-point detection,
 * file discovery, and export collection to analyze public vs internal API.
 *
 * @module extensions/code-intel/api-surface
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import { toRelativePath, normalizePath } from '../../shared/utils.js';
import {
  detectEntryPoints,
  findSourceFiles,
  languageServiceManager,
  collectPublicExports,
  collectAllExports,
} from '../../core/code-intel/index.js';
import type { ApiSurfaceArgs, PublicApiExport } from '../../core/code-intel/types.js';

/**
 * Internal API export (without jsdoc).
 */
interface InternalApiExport {
  name: string;
  kind: string;
  type: string;
  file: string;
  line: number;
}

/**
 * Analyze the public vs internal API surface of a module or package.
 *
 * Orchestrates: detect entry points → find source files → get language service
 * → collectPublicExports → collectAllExports → classify → ok()
 *
 * @param args - The get_api_surface tool arguments
 * @returns MCP tool response with JSON-formatted API surface
 *
 * @example
 * ```typescript
 * const result = await getApiSurface({ path: 'packages/core' });
 * // Returns public_api, internal_api, and entry_points
 * ```
 */
export async function getApiSurface(args: ApiSurfaceArgs): Promise<McpResponse> {
  try {
    const targetPath = args.path ?? '.';
    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(PROJECT_ROOT, targetPath);

    if (!absolutePath.startsWith(PROJECT_ROOT)) {
      return fail(`Path is outside project root: ${targetPath}`);
    }

    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        return fail(`Path is not a directory: ${targetPath}`);
      }
    } catch {
      return fail(`Path not found: ${targetPath}`);
    }

    // Get or detect entry points
    let entryPoints: string[];
    if (args.entry_points && args.entry_points.length > 0) {
      // entry_points are resolved relative to PROJECT_ROOT (same as `path` arg),
      // not relative to absolutePath — callers pass root-relative paths like
      // "delete_me/src/index.ts", not sub-paths within the scanned directory.
      entryPoints = args.entry_points.map((ep) =>
        path.isAbsolute(ep) ? ep : path.resolve(PROJECT_ROOT, ep)
      );
      const existChecks = await Promise.all(entryPoints.map((ep) => fs.access(ep).then(() => true, () => false)));
      entryPoints = entryPoints.filter((_, i) => existChecks[i]);
    } else {
      entryPoints = await detectEntryPoints(absolutePath);
    }

    if (entryPoints.length === 0) {
      return ok({ public_api: [], internal_api: [], entry_points: [] });
    }

    const sourceFiles = await findSourceFiles(absolutePath);

    if (sourceFiles.length === 0) {
      return ok({
        public_api: [],
        internal_api: [],
        entry_points: entryPoints.map((ep) => toRelativePath(ep, PROJECT_ROOT)),
      });
    }

    // Get language service
    const { service } = await languageServiceManager.getServiceForFile(
      normalizePath(entryPoints[0])
    );

    const publicExports = collectPublicExports(entryPoints, service);
    const allExports = collectAllExports(sourceFiles, service);

    const publicApi: PublicApiExport[] = [];
    const internalApi: InternalApiExport[] = [];
    const publicKeys = new Set(publicExports.keys());

    for (const [key, exp] of allExports) {
      if (publicKeys.has(key)) {
        const publicExp = publicExports.get(key)!;
        publicApi.push({
          name: publicExp.name,
          kind: publicExp.kind,
          type: publicExp.type,
          file: toRelativePath(publicExp.file, PROJECT_ROOT),
          line: publicExp.line,
          jsdoc: publicExp.jsdoc,
        });
      } else {
        internalApi.push({
          name: exp.name,
          kind: exp.kind,
          type: exp.type,
          file: toRelativePath(exp.file, PROJECT_ROOT),
          line: exp.line,
        });
      }
    }

    const sortByFileLine = <T extends { file: string; line: number }>(arr: T[]) =>
      arr.sort((a, b) => {
        const fileCompare = a.file.localeCompare(b.file);
        if (fileCompare !== 0) return fileCompare;
        return a.line - b.line;
      });

    return ok({
      public_api: sortByFileLine(publicApi),
      internal_api: sortByFileLine(internalApi),
      entry_points: entryPoints.map((ep) => toRelativePath(ep, PROJECT_ROOT)),
    });
  } catch (error) {
    return failFromException(error, 'Failed to analyze API surface');
  }
}
