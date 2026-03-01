/**
 * Type Information Extraction
 *
 * Extracted from breaking-changes.ts. Provides utilities to extract
 * exported symbol type info from TypeScript files for API comparison.
 *
 * @module core/code-intel/type-extraction
 */

import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';

import { logWarn } from '../../shared/logger.js';
import { languageServiceManager } from './language-service.js';

/**
 * Type information for a single exported symbol.
 */
export interface SymbolInfo {
  /** Symbol name */
  name: string;
  /** Symbol kind (function, class, interface, etc.) */
  kind: string;
  /** Full type signature */
  signature: string;
  /** Line number (1-based) */
  line: number;
  /** Whether the symbol is exported */
  exported: boolean;
}

/**
 * Type information for all exported symbols in a file.
 */
export interface FileTypeInfo {
  /** Relative file path */
  file: string;
  /** Array of symbol info objects */
  symbols: SymbolInfo[];
}

/**
 * Extract exported symbols and their type signatures from a file on disk.
 *
 * @param filePath - Absolute or relative file path
 * @param projectRoot - Project root for path resolution
 * @returns FileTypeInfo with symbols found in the file
 */
export async function extractTypeInfo(
  filePath: string,
  projectRoot: string
): Promise<FileTypeInfo> {
  const symbols: SymbolInfo[] = [];

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot, filePath);

    try {
      await node_fs.access(absolutePath);
    } catch {
      return { file: filePath, symbols };
    }

    const { service, program } = await languageServiceManager.getServiceForFile(absolutePath);
    const normalizedAbsPath = absolutePath.replace(/\\/g, '/');
    const sourceFile = program.getSourceFile(normalizedAbsPath);

    if (!sourceFile) {
      return { file: filePath, symbols };
    }

    const navTree = service.getNavigationTree(normalizedAbsPath);

    if (navTree && navTree.childItems) {
      for (const item of navTree.childItems) {
        if (item.text.startsWith('<') || item.text.startsWith('_')) continue;

        const spans = item.spans;
        if (!spans || spans.length === 0) continue;

        const pos = spans[0].start;
        const { line } = sourceFile.getLineAndCharacterOfPosition(pos);

        const quickInfo = service.getQuickInfoAtPosition(normalizedAbsPath, pos);
        let signature = '';

        if (quickInfo && quickInfo.displayParts) {
          signature = quickInfo.displayParts.map((p) => p.text).join('');
        }

        const isExported =
          signature.includes('export ') || item.kindModifiers?.includes('export') || false;

        symbols.push({
          name: item.text,
          kind: item.kind,
          signature,
          line: line + 1,
          exported: isExported,
        });
      }
    }
  } catch (error) {
    logWarn(`Failed to extract type info from ${filePath}`, error);
  }

  return { file: filePath, symbols };
}

/**
 * Execute a function with a temporary file, ensuring cleanup regardless of outcome.
 *
 * Creates the file at `tempPath` with `content`, calls `fn(tempPath)`,
 * then deletes the file and parent directory (if empty) in a finally block.
 *
 * @param tempPath - Absolute path for the temporary file
 * @param content - Content to write to the temp file
 * @param fn - Function to call with the temp file path
 * @returns The result of calling fn
 */
export async function withTempFile<T>(
  tempPath: string,
  content: string,
  fn: (filePath: string) => Promise<T>
): Promise<T> {
  const dir = path.dirname(tempPath);
  await node_fs.mkdir(dir, { recursive: true });
  await node_fs.writeFile(tempPath, content, 'utf-8');
  try {
    return await fn(tempPath);
  } finally {
    await node_fs.unlink(tempPath).catch(() => undefined);
    await node_fs.rm(dir, { recursive: true }).catch(() => undefined);
  }
}

/**
 * Build a unique temp directory path and full temp file path under `root`.
 *
 * @param root - Project root to place the temp directory under
 * @param basename - The filename to use inside the temp directory
 * @returns Object with `dir` (the unique temp directory) and `file` (the full temp file path)
 */
export function makeTempPath(
  root: string,
  basename: string
): { dir: string; file: string } {
  const dir = path.join(
    root,
    `.goodvibes-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  return { dir, file: path.join(dir, basename) };
}

/**
 * Extract type info from raw content by writing to a temp file.
 * Used to analyze file content at a specific git ref.
 *
 * @param originalPath - The original file path (used in result)
 * @param content - File content to analyze
 * @param projectRoot - Project root for temp directory placement
 * @returns FileTypeInfo with the original path and extracted symbols
 */
export async function extractTypeInfoFromContent(
  originalPath: string,
  content: string,
  projectRoot: string
): Promise<FileTypeInfo> {
  const { file: tempFile } = makeTempPath(projectRoot, path.basename(originalPath));

  return withTempFile(tempFile, content, async (filePath) => {
    const result = await extractTypeInfo(filePath, projectRoot);
    result.file = originalPath;
    return result;
  });
}
