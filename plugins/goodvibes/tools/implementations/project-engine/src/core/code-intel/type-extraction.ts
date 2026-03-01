/**
 * Type Information Extraction
 *
 * Extracted from breaking-changes.ts. Provides utilities to extract
 * exported symbol type info from TypeScript files for API comparison.
 *
 * @module core/code-intel/type-extraction
 */

import * as node_fs from 'node:fs/promises';
import * as fs from 'node:fs';
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

    if (!fs.existsSync(absolutePath)) {
      return { file: filePath, symbols };
    }

    const { service, program } = await languageServiceManager.getServiceForFile(absolutePath);
    const sourceFile = program.getSourceFile(absolutePath.replace(/\\/g, '/'));

    if (!sourceFile) {
      return { file: filePath, symbols };
    }

    const navTree = service.getNavigationTree(absolutePath.replace(/\\/g, '/'));

    if (navTree && navTree.childItems) {
      for (const item of navTree.childItems) {
        if (item.text.startsWith('<') || item.text.startsWith('_')) continue;

        const spans = item.spans;
        if (!spans || spans.length === 0) continue;

        const pos = spans[0].start;
        const { line } = sourceFile.getLineAndCharacterOfPosition(pos);

        const quickInfo = service.getQuickInfoAtPosition(absolutePath.replace(/\\/g, '/'), pos);
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
  const tempDir = path.join(projectRoot, '.goodvibes-temp');
  const tempFile = path.join(tempDir, path.basename(originalPath));

  try {
    try {
      await node_fs.mkdir(tempDir, { recursive: true });
    } catch {
      // Already exists
    }

    await node_fs.writeFile(tempFile, content, 'utf-8');

    const result = await extractTypeInfo(tempFile, projectRoot);
    result.file = originalPath;
    return result;
  } finally {
    try {
      await node_fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    try {
      const remaining = await node_fs.readdir(tempDir);
      if (remaining.length === 0) {
        await node_fs.rmdir(tempDir);
      }
    } catch {
      // Ignore
    }
  }
}
