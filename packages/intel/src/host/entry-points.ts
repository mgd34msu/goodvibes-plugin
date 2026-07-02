/**
 * Entry-point detection for a package/directory.
 *
 * Ported verbatim from project-engine `core/code-intel/entry-points.ts`.
 * Reads package.json main/module/exports, then falls back to conventional
 * entry-point file names, then a `src/` subdirectory.
 */

import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';

import { ENTRY_POINT_NAMES } from './constants.js';

/**
 * Auto-detect entry points for a directory.
 * @param dirPath - absolute directory to inspect
 * @returns absolute entry-point file paths that exist on disk
 */
export async function detectEntryPoints(dirPath: string): Promise<string[]> {
  const entryPoints: string[] = [];

  let packageJson: Record<string, unknown> | null = null;
  try {
    const content = await node_fs.readFile(path.join(dirPath, 'package.json'), 'utf-8');
    packageJson = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // no/invalid package.json — fall through to conventions
  }

  const addIfExists = async (p: string): Promise<void> => {
    try {
      await node_fs.access(p);
      if (!entryPoints.includes(p)) entryPoints.push(p);
    } catch {
      // does not exist — skip
    }
  };

  if (packageJson) {
    const addExportPath = async (
      exportPath: string | { default?: string; import?: string; require?: string },
    ): Promise<void> => {
      if (typeof exportPath === 'string') {
        await addIfExists(path.resolve(dirPath, exportPath));
      } else if (typeof exportPath === 'object') {
        for (const key of ['default', 'import', 'require'] as const) {
          const val = exportPath[key];
          if (typeof val === 'string') await addIfExists(path.resolve(dirPath, val));
        }
      }
    };

    if (typeof packageJson.main === 'string') {
      const mainPath = path.resolve(dirPath, packageJson.main);
      await addIfExists(mainPath);
      const tsVersion = mainPath.replace(/\.js$/, '.ts');
      if (mainPath !== tsVersion) await addIfExists(tsVersion);
    }

    if (typeof packageJson.module === 'string') {
      await addIfExists(path.resolve(dirPath, packageJson.module));
    }

    if (packageJson.exports) {
      if (typeof packageJson.exports === 'string') {
        await addExportPath(packageJson.exports);
      } else if (typeof packageJson.exports === 'object' && packageJson.exports !== null) {
        const exportsObj = packageJson.exports as Record<string, unknown>;
        for (const key of Object.keys(exportsObj)) {
          const value = exportsObj[key];
          if (typeof value === 'string') {
            await addIfExists(path.resolve(dirPath, value));
          } else if (typeof value === 'object' && value !== null) {
            await addExportPath(value as { default?: string; import?: string; require?: string });
          }
        }
      }
    }
  }

  for (const name of ENTRY_POINT_NAMES) {
    await addIfExists(path.join(dirPath, name));
  }

  const srcDir = path.join(dirPath, 'src');
  try {
    if ((await node_fs.stat(srcDir)).isDirectory()) {
      for (const name of ENTRY_POINT_NAMES) {
        await addIfExists(path.join(srcDir, name));
      }
    }
  } catch {
    // no src directory
  }

  return entryPoints;
}
