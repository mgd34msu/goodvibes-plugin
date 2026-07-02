/**
 * In-memory filesystem overlay for hypothetical-edit analysis.
 *
 * Ported from project-engine `core/code-intel/virtual-fs.ts`. This is the ONE
 * place a SECOND, throwaway LanguageService is allowed: it types a proposed edit
 * without writing to disk. It is opt-in and separate from the shared program in
 * {@link CompilerHost} (which stays the single source of truth for real files).
 * Provided for lanes 3/4; no live tool in the alpha 14 requires it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { toTsPath } from './paths.js';
import { TS_ANALYSIS_OPTIONS } from './constants.js';
import { findTsConfig, readTsConfig, findTypescriptLibDir } from './tsconfig.js';

/** A single proposed edit to a file. */
export interface ProposedEdit {
  file: string;
  old_text?: string;
  new_text?: string;
  content?: string;
}

/** Overlay that prefers in-memory content over disk. */
export class VirtualFileSystem {
  private files = new Map<string, string>();

  /** Content of a file, preferring the overlay, else disk, else undefined. */
  getContent(filePath: string): string | undefined {
    const normalized = toTsPath(filePath);
    if (this.files.has(normalized)) return this.files.get(normalized);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  /** Set overlay content for a file. */
  setContent(filePath: string, content: string): void {
    this.files.set(toTsPath(filePath), content);
  }

  /** True when the file exists in the overlay or on disk. */
  exists(filePath: string): boolean {
    return this.files.has(toTsPath(filePath)) || fs.existsSync(filePath);
  }

  /** Overlay (modified) file paths. */
  getModifiedFiles(): string[] {
    return Array.from(this.files.keys());
  }
}

/**
 * Apply a proposed edit to content, returning [newContent, error] (one null).
 * @param currentContent - current content, or undefined if the file is new
 * @param edit - the edit to apply
 */
export function applyEdit(
  currentContent: string | undefined,
  edit: ProposedEdit,
): [string | null, string | null] {
  if (edit.content !== undefined) return [edit.content, null];

  if (edit.old_text !== undefined && edit.new_text !== undefined) {
    if (currentContent === undefined) {
      return [null, 'File does not exist and old_text replacement requires an existing file'];
    }
    if (!currentContent.includes(edit.old_text)) {
      const preview = edit.old_text.slice(0, 50) + (edit.old_text.length > 50 ? '...' : '');
      return [null, `old_text not found in file: "${preview}"`];
    }
    const occurrences = currentContent.split(edit.old_text).length - 1;
    if (occurrences > 1) {
      return [null, `old_text matches ${occurrences} locations. Provide more context to disambiguate.`];
    }
    return [currentContent.replace(edit.old_text, edit.new_text), null];
  }

  return [null, "Invalid edit: provide either 'content' or both 'old_text' and 'new_text'"];
}

/**
 * Create a throwaway LanguageService backed by a {@link VirtualFileSystem}.
 * @param vfs - overlay holding the edited content
 * @param filesToCheck - files to include in the compilation
 * @param projectRoot - the project root for config + lib resolution
 */
export async function createVirtualLanguageService(
  vfs: VirtualFileSystem,
  filesToCheck: string[],
  projectRoot: string,
): Promise<ts.LanguageService> {
  const configPath = await findTsConfig(projectRoot);
  const compilerOptions = configPath ? await readTsConfig(configPath) : { ...TS_ANALYSIS_OPTIONS };
  const tsLibDir = findTypescriptLibDir(projectRoot);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => filesToCheck.map(toTsPath),
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const content = vfs.getContent(fileName);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => {
      const libFileName = ts.getDefaultLibFileName(options);
      return tsLibDir ? path.join(tsLibDir, libFileName) : ts.getDefaultLibFilePath(options);
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
