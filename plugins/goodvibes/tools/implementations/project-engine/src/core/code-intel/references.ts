/**
 * Reference Finding Utilities
 *
 * Deduplicated from dead-code.ts, safe-delete.ts, and semantic-diff.ts.
 * Provides functions to find and count symbol references.
 *
 * @module core/code-intel/references
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import ts from 'typescript';

import { logWarn } from '../../shared/logger.js';
import { toRelativePath } from '../../shared/utils.js';
import { languageServiceManager } from './language-service.js';
import { isTestFile } from './file-utils.js';

/**
 * Count references to a symbol at a given position, optionally excluding test files.
 *
 * @param service - TypeScript language service
 * @param fileName - Normalized file path
 * @param position - Byte offset of the symbol
 * @param includeTests - Whether to count test file references
 * @returns Object with total and external reference counts
 */
export function countReferences(
  service: ts.LanguageService,
  fileName: string,
  position: number,
  includeTests: boolean
): { total: number; external: number } {
  const references = service.getReferencesAtPosition(fileName, position);

  if (!references) {
    return { total: 0, external: 0 };
  }

  let total = 0;
  let external = 0;

  for (const ref of references) {
    // TS 5.x removed isDefinition from ReferenceEntry — cast for backward compat
    const refEntry = ref as ts.ReferenceEntry & { isDefinition?: boolean };
    if (refEntry.isDefinition) {
      continue;
    }

    if (!includeTests && isTestFile(ref.fileName)) {
      continue;
    }

    total++;

    if (ref.fileName !== fileName) {
      external++;
    }
  }

  return { total, external };
}

/**
 * Check if two references are on the same line in the same file.
 *
 * @param ref1File - First file path
 * @param ref1Line - First line number
 * @param ref2File - Second file path
 * @param ref2Line - Second line number
 * @returns True if both references are on the same line in the same file
 */
export function isSameLine(
  ref1File: string,
  ref1Line: number,
  ref2File: string,
  ref2Line: number
): boolean {
  return ref1File === ref2File && ref1Line === ref2Line;
}

/**
 * Check if a reference is within the same declaration as the definition.
 * Uses same-line heuristic: if ref and def are on the same line, it's the same declaration.
 *
 * @param refFile - Reference file path
 * @param refLine - Reference line number
 * @param defFile - Definition file path
 * @param defLine - Definition line number
 * @returns True if the reference is in the same declaration
 */
// Kept as a named abstraction for clarity and future expansion
// (e.g., multi-line declarations may need a more sophisticated check).
export function isInSameDeclaration(
  refFile: string,
  refLine: number,
  defFile: string,
  defLine: number
): boolean {
  return isSameLine(refFile, refLine, defFile, defLine);
}

/**
 * Find all files that reference symbols exported from a given file.
 *
 * @param filePath - Absolute or relative path to the source file
 * @param projectRoot - The project root for path resolution
 * @returns Array of relative file paths that reference the given file
 */
export async function findReferencingFiles(
  filePath: string,
  projectRoot: string
): Promise<string[]> {
  const referencingFiles = new Set<string>();

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot, filePath);

    try {
      await fs.access(absolutePath);
    } catch {
      return [];
    }

    const { service, program } = await languageServiceManager.getServiceForFile(absolutePath);
    const sourceFile = program.getSourceFile(absolutePath.replace(/\\/g, '/'));

    if (!sourceFile) {
      return [];
    }

    const navTree = service.getNavigationTree(absolutePath.replace(/\\/g, '/'));

    if (navTree && navTree.childItems) {
      for (const item of navTree.childItems) {
        if (item.text.startsWith('<') || item.text.startsWith('_')) continue;

        const spans = item.spans;
        if (!spans || spans.length === 0) continue;

        const pos = spans[0].start;

        try {
          const references = service.findReferences(absolutePath.replace(/\\/g, '/'), pos);

          if (references) {
            for (const refGroup of references) {
              for (const ref of refGroup.references) {
                const refFile = ref.fileName;
                if (
                  refFile !== absolutePath.replace(/\\/g, '/') &&
                  !refFile.includes('node_modules')
                ) {
                  referencingFiles.add(toRelativePath(refFile, projectRoot));
                }
              }
            }
          }
        } catch {
          // Ignore reference finding errors for individual symbols
        }
      }
    }
  } catch (error) {
    logWarn(`Failed to find references for ${filePath}`, error);
  }

  return Array.from(referencingFiles);
}
