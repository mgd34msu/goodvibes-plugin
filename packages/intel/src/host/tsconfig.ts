/**
 * tsconfig discovery + parsing, and TypeScript lib-directory resolution.
 *
 * Ported from project-engine `core/code-intel/tsconfig.ts` and the
 * `findTypescriptLibDir` helper from `core/code-intel/virtual-fs.ts`.
 *
 * Lib-dir resolution matters in v2 because `typescript` is BUNDLED into the
 * server (§5.1): at runtime `ts.getDefaultLibFilePath()` resolves next to the
 * esbuild bundle, where the `lib.*.d.ts` files do NOT live. So the host prefers
 * the TARGET project's `node_modules/typescript/lib` (found by walking up),
 * falling back to the bundled default only when the project has no TypeScript.
 */

import * as fs from 'node:fs';
import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';

import { logger } from '@goodvibes/core/logging';
import { toTsPath } from './paths.js';
import { TS_ANALYSIS_OPTIONS } from './constants.js';

/**
 * Walk up from `startPath` to find the nearest `tsconfig.json` (synchronous —
 * used inside the synchronous language-service host callbacks).
 * @param startPath - file or directory to start from
 * @returns TS-normalized absolute path to the tsconfig, or null
 */
export function findTsConfigSync(startPath: string): string | null {
  let dir = path.extname(startPath) ? path.dirname(startPath) : startPath;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      return toTsPath(tsconfigPath);
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }
  return null;
}

/**
 * Async variant of {@link findTsConfigSync}.
 * @param startPath - file or directory to start from
 */
export async function findTsConfig(startPath: string): Promise<string | null> {
  let dir = path.extname(startPath) ? path.dirname(startPath) : startPath;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    try {
      await node_fs.access(tsconfigPath);
      return toTsPath(tsconfigPath);
    } catch {
      // not here — keep walking
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }
  return null;
}

/**
 * Read and parse a tsconfig synchronously, merged over the analysis defaults.
 * @param configPath - absolute path to tsconfig.json
 */
export function readTsConfigSync(configPath: string): ts.CompilerOptions {
  return parseTsConfigSync(configPath).options;
}

/**
 * Parse a tsconfig synchronously, returning BOTH the merged compiler options and
 * the resolved project file list. The file list seeds the program's root set so
 * project-wide reference searches (code_safe_delete) see sibling files that do
 * not import the target — TypeScript's reference engine only searches files that
 * are part of the program.
 * @param configPath - absolute path to tsconfig.json
 */
export function parseTsConfigSync(configPath: string): {
  options: ts.CompilerOptions;
  fileNames: string[];
} {
  const configDir = toTsPath(path.dirname(configPath));
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    logger.warn(`Error reading tsconfig at ${configPath}`, result.error.messageText);
    return { options: { ...TS_ANALYSIS_OPTIONS }, fileNames: [] };
  }

  const parsed = ts.parseJsonConfigFileContent(result.config, ts.sys, configDir, undefined, configPath);
  if (parsed.errors.length > 0) {
    logger.warn(`Errors parsing tsconfig at ${configPath}`, parsed.errors.length);
  }

  return { options: { ...TS_ANALYSIS_OPTIONS, ...parsed.options }, fileNames: parsed.fileNames };
}

/**
 * Async variant of {@link readTsConfigSync}.
 * @param configPath - absolute path to tsconfig.json
 */
export async function readTsConfig(configPath: string): Promise<ts.CompilerOptions> {
  const configDir = toTsPath(path.dirname(configPath));

  let rawContent: string;
  try {
    rawContent = await node_fs.readFile(configPath, 'utf-8');
  } catch {
    logger.warn(`Could not read tsconfig at ${configPath}`);
    return { ...TS_ANALYSIS_OPTIONS };
  }

  const result = ts.readConfigFile(configPath, () => rawContent);
  if (result.error) {
    logger.warn(`Error reading tsconfig at ${configPath}`, result.error.messageText);
    return { ...TS_ANALYSIS_OPTIONS };
  }

  const parsed = ts.parseJsonConfigFileContent(result.config, ts.sys, configDir, undefined, configPath);
  if (parsed.errors.length > 0) {
    logger.warn(`Errors parsing tsconfig at ${configPath}`, parsed.errors.length);
  }

  return { ...TS_ANALYSIS_OPTIONS, ...parsed.options };
}

/**
 * Find a TypeScript `lib` directory by walking up from a start directory.
 * Prefers the target project's own TypeScript so the bundled compiler can load
 * `lib.*.d.ts` at runtime (see module header).
 * @param startDir - directory to start walking from
 * @returns absolute path to a `.../typescript/lib` directory, or null
 */
export function findTypescriptLibDir(startDir: string): string | null {
  let dir = startDir;
  const root = path.parse(dir).root;
  while (dir !== root) {
    const tsLibDir = path.join(dir, 'node_modules', 'typescript', 'lib');
    if (fs.existsSync(tsLibDir)) return tsLibDir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
