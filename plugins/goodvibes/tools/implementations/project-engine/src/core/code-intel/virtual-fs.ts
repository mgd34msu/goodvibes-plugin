/**
 * Virtual File System for Edit Preview
 *
 * Extracted from preview-edits.ts. Provides an in-memory overlay
 * over the real filesystem for validating edits without writing to disk.
 *
 * @module core/code-intel/virtual-fs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { normalizePath } from '../../shared/utils.js';
import { TS_ANALYSIS_OPTIONS } from './constants.js';
import { findTsConfig, readTsConfig } from './tsconfig.js';
import type { ProposedEdit } from './types.js';

/**
 * Find the TypeScript lib directory by walking up from a start directory.
 * Needed because the bundled TypeScript can't resolve its own lib files.
 *
 * @param startDir - Directory to start searching from
 * @returns Absolute path to TypeScript's lib directory, or null
 */
function findTypescriptLibDir(startDir: string): string | null {
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

/**
 * Virtual file system that holds modified file contents.
 * Used to create snapshots with edits applied without touching disk.
 */
export class VirtualFileSystem {
  private files = new Map<string, string>();

  /**
   * Get file content, preferring virtual content over disk.
   *
   * @param filePath - The file path to read
   * @returns File content string, or undefined if not found
   */
  getContent(filePath: string): string | undefined {
    const normalized = normalizePath(filePath);

    if (this.files.has(normalized)) {
      return this.files.get(normalized);
    }

    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  /**
   * Set virtual file content.
   *
   * @param filePath - The file path
   * @param content - The content to store
   */
  setContent(filePath: string, content: string): void {
    const normalized = normalizePath(filePath);
    this.files.set(normalized, content);
  }

  /**
   * Check if a file exists (virtual or on disk).
   *
   * @param filePath - The file path to check
   * @returns True if the file exists in virtual FS or on disk
   */
  exists(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    return this.files.has(normalized) || fs.existsSync(filePath);
  }

  /**
   * Get all modified (virtual) file paths.
   *
   * @returns Array of normalized file paths in the virtual FS
   */
  getModifiedFiles(): string[] {
    return Array.from(this.files.keys());
  }
}

/**
 * Apply an edit to file content.
 *
 * @param currentContent - Current file content, or undefined if file doesn't exist
 * @param edit - The proposed edit to apply
 * @returns Tuple of [newContent, error] — one of the two will be null
 */
export function applyEdit(
  currentContent: string | undefined,
  edit: ProposedEdit
): [string | null, string | null] {
  if (edit.content !== undefined) {
    return [edit.content, null];
  }

  if (edit.old_text !== undefined && edit.new_text !== undefined) {
    if (currentContent === undefined) {
      return [null, `File does not exist and old_text replacement requires existing file`];
    }

    if (!currentContent.includes(edit.old_text)) {
      return [
        null,
        `old_text not found in file: "${edit.old_text.slice(0, 50)}${
          edit.old_text.length > 50 ? '...' : ''
        }"`,
      ];
    }

    const occurrences = currentContent.split(edit.old_text).length - 1;
    if (occurrences > 1) {
      return [
        null,
        `old_text matches ${occurrences} locations in file. Provide more context to make it unique.`,
      ];
    }

    const newContent = currentContent.replace(edit.old_text, edit.new_text);
    return [newContent, null];
  }

  return [null, `Invalid edit: must provide either 'content' or both 'old_text' and 'new_text'`];
}

/**
 * Create a TypeScript language service backed by a virtual file system.
 *
 * @param vfs - The virtual file system with modified content
 * @param filesToCheck - Array of file paths to include in compilation
 * @param projectRoot - The project root directory
 * @returns A TypeScript language service instance
 */
export async function createVirtualLanguageService(
  vfs: VirtualFileSystem,
  filesToCheck: string[],
  projectRoot: string
): Promise<ts.LanguageService> {
  const configPath = await findTsConfig(projectRoot);
  const compilerOptions = configPath
    ? await readTsConfig(configPath)
    : { ...TS_ANALYSIS_OPTIONS };

  const fileVersions = new Map<string, number>();

  for (const file of filesToCheck) {
    const normalized = normalizePath(file);
    fileVersions.set(normalized, 1);
  }

  // Resolve TypeScript lib directory from project's node_modules.
  // The bundled TypeScript can't find its own .d.ts lib files since
  // ts.getDefaultLibFilePath() resolves relative to the bundle's __dirname.
  const tsLibDir = findTypescriptLibDir(projectRoot);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => filesToCheck.map(normalizePath),
    getScriptVersion: (fileName) => {
      const normalized = normalizePath(fileName);
      return String(fileVersions.get(normalized) ?? 0);
    },
    getScriptSnapshot: (fileName) => {
      const content = vfs.getContent(fileName);
      if (content === undefined) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => {
      const libFileName = ts.getDefaultLibFileName(options);
      if (tsLibDir) {
        return path.join(tsLibDir, libFileName);
      }
      return ts.getDefaultLibFilePath(options);
    },
    fileExists: (fileName) => vfs.exists(fileName),
    readFile: (fileName) => vfs.getContent(fileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };

  return ts.createLanguageService(host, ts.createDocumentRegistry());
}
