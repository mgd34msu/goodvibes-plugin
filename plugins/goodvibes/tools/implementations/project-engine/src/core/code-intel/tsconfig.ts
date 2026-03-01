/**
 * TypeScript Config Discovery and Parsing
 *
 * Extracted from language-service.ts and preview-edits.ts (deduplicated).
 * Provides async-safe config file operations.
 *
 * @module core/code-intel/tsconfig
 */

import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';

import { logWarn } from '../../shared/logger.js';
import { normalizePath } from '../../shared/utils.js';
import { TS_ANALYSIS_OPTIONS } from './constants.js';

/**
 * Find tsconfig.json by walking up from a file or directory path.
 *
 * @param startPath - File or directory to start searching from
 * @returns Absolute normalized path to tsconfig.json, or null if not found
 */
export async function findTsConfig(startPath: string): Promise<string | null> {
  let dir = path.extname(startPath) ? path.dirname(startPath) : startPath;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    try {
      await node_fs.access(tsconfigPath);
      return normalizePath(tsconfigPath);
    } catch {
      // Not found at this level, continue up
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }

  return null;
}

/**
 * Read and parse tsconfig.json, merging with TS_ANALYSIS_OPTIONS defaults.
 *
 * @param configPath - Absolute path to tsconfig.json
 * @returns Merged compiler options
 */
export async function readTsConfig(configPath: string): Promise<ts.CompilerOptions> {
  const configDir = normalizePath(path.dirname(configPath));

  let rawContent: string;
  try {
    rawContent = await node_fs.readFile(configPath, 'utf-8');
  } catch {
    logWarn(`Could not read tsconfig at ${configPath}`);
    return { ...TS_ANALYSIS_OPTIONS };
  }

  const result = ts.readConfigFile(configPath, () => rawContent);

  if (result.error) {
    logWarn(`Error reading tsconfig at ${configPath}`, result.error.messageText);
    return { ...TS_ANALYSIS_OPTIONS };
  }

  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
    configDir,
    undefined,
    configPath
  );

  if (parsed.errors.length > 0) {
    logWarn(`Errors parsing tsconfig at ${configPath}`, parsed.errors);
  }

  return {
    ...TS_ANALYSIS_OPTIONS,
    ...parsed.options,
  };
}

/**
 * Synchronous variant of readTsConfig for use inside TS Language Service host callbacks.
 * The TS Language Service host is synchronous by design.
 *
 * @param configPath - Absolute path to tsconfig.json
 * @returns Merged compiler options
 */
export function readTsConfigSync(configPath: string): ts.CompilerOptions {
  const configDir = normalizePath(path.dirname(configPath));
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    logWarn(`Error reading tsconfig at ${configPath}`, result.error.messageText);
    return { ...TS_ANALYSIS_OPTIONS };
  }

  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
    configDir,
    undefined,
    configPath
  );

  if (parsed.errors.length > 0) {
    logWarn(`Errors parsing tsconfig at ${configPath}`, parsed.errors);
  }

  return {
    ...TS_ANALYSIS_OPTIONS,
    ...parsed.options,
  };
}
