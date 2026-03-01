/**
 * Entry Point Detection
 *
 * Extracted from api-surface.ts. Detects package entry points
 * from package.json and common naming conventions.
 *
 * @module core/code-intel/entry-points
 */

import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';

import { ENTRY_POINT_NAMES } from './constants.js';

/**
 * Auto-detect entry points for a directory.
 *
 * Checks package.json main/module/exports fields, then falls back
 * to common entry point file names (index.ts, main.ts, etc.).
 *
 * @param dirPath - The directory to detect entry points for
 * @returns Array of absolute entry point file paths
 */
export async function detectEntryPoints(dirPath: string): Promise<string[]> {
  const entryPoints: string[] = [];

  // Check for package.json main/module/exports
  const packageJsonPath = path.join(dirPath, 'package.json');

  let packageJson: Record<string, unknown> | null = null;
  try {
    const content = await node_fs.readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // No package.json or invalid JSON, skip
  }

  const addIfExists = async (p: string): Promise<void> => {
    try {
      await node_fs.access(p);
      if (!entryPoints.includes(p)) {
        entryPoints.push(p);
      }
    } catch {
      // File does not exist, skip
    }
  };

  if (packageJson) {
    const addExportPath = async (
      exportPath: string | { default?: string; import?: string; require?: string }
    ): Promise<void> => {
      if (typeof exportPath === 'string') {
        await addIfExists(path.resolve(dirPath, exportPath));
      } else if (typeof exportPath === 'object') {
        for (const key of ['default', 'import', 'require'] as const) {
          const val = exportPath[key];
          if (typeof val === 'string') {
            await addIfExists(path.resolve(dirPath, val));
          }
        }
      }
    };

    // Check main field
    if (packageJson.main && typeof packageJson.main === 'string') {
      const mainPath = path.resolve(dirPath, packageJson.main);
      await addIfExists(mainPath);
      // Also check for .ts version if main is .js
      const tsVersion = mainPath.replace(/\.js$/, '.ts');
      if (mainPath !== tsVersion) await addIfExists(tsVersion);
    }

    // Check module field
    if (packageJson.module && typeof packageJson.module === 'string') {
      await addIfExists(path.resolve(dirPath, packageJson.module));
    }

    // Check exports field
    if (packageJson.exports) {
      if (typeof packageJson.exports === 'string') {
        await addExportPath(packageJson.exports);
      } else if (typeof packageJson.exports === 'object' && packageJson.exports !== null) {
        for (const key of Object.keys(packageJson.exports as Record<string, unknown>)) {
          await addExportPath(
            (packageJson.exports as Record<string, unknown>)[key] as string
          );
        }
      }
    }
  }

  // Check for common entry point files at root
  for (const name of ENTRY_POINT_NAMES) {
    await addIfExists(path.join(dirPath, name));
  }

  // Check src directory
  const srcDir = path.join(dirPath, 'src');
  try {
    const srcStat = await node_fs.stat(srcDir);
    if (srcStat.isDirectory()) {
      for (const name of ENTRY_POINT_NAMES) {
        await addIfExists(path.join(srcDir, name));
      }
    }
  } catch {
    // No src directory
  }

  return entryPoints;
}
