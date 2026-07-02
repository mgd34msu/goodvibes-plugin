/**
 * Reference-finding utilities over the LanguageService.
 *
 * Ported from project-engine `core/code-intel/references.ts`. Every function
 * here uses TypeScript's semantic reference engine
 * (`getReferencesAtPosition` / `findReferences`) — NEVER a text/regex scan.
 * That is the guarantee code_safe_delete depends on (§4.1 port note).
 */

import ts from 'typescript';

import { logger } from '@goodvibes/core/logging';
import { toTsPath, makeRelativePath } from './paths.js';
import { isDefinitionRef } from './ast-utils.js';
import type { CompilerHost } from './compiler-host.js';

/**
 * Count semantic references to the symbol at a position, split into total and
 * external (other-file) counts. Definitions and (optionally) test files skip.
 * @param service - the language service
 * @param fileName - TS-normalized file path of the symbol
 * @param position - byte offset of the symbol
 * @param includeTests - whether test-file references count
 */
export function countReferences(
  service: ts.LanguageService,
  fileName: string,
  position: number,
  includeTests: boolean,
  isTestFile: (p: string) => boolean,
): { total: number; external: number } {
  const references = service.getReferencesAtPosition(fileName, position);
  if (!references) return { total: 0, external: 0 };

  let total = 0;
  let external = 0;
  for (const ref of references) {
    if (isDefinitionRef(ref)) continue;
    if (!includeTests && isTestFile(ref.fileName)) continue;
    total++;
    if (ref.fileName !== fileName) external++;
  }
  return { total, external };
}

/**
 * True when two references share the same file and line.
 */
export function isSameLine(
  ref1File: string,
  ref1Line: number,
  ref2File: string,
  ref2Line: number,
): boolean {
  return ref1File === ref2File && ref1Line === ref2Line;
}

/**
 * True when a reference sits in the same declaration as the definition
 * (same-line heuristic — a self-reference within the declaration itself).
 */
export function isInSameDeclaration(
  refFile: string,
  refLine: number,
  defFile: string,
  defLine: number,
): boolean {
  return isSameLine(refFile, refLine, defFile, defLine);
}

/**
 * Find files that reference any top-level symbol of `absoluteFilePath`, using
 * the navigation tree + `findReferences` (semantic, not textual).
 * @param host - the shared compiler host
 * @param absoluteFilePath - absolute path of the source file
 * @param projectRoot - root used to relativize the returned paths
 * @returns relative paths of referencing files (excluding self + node_modules)
 */
export function findReferencingFiles(
  host: CompilerHost,
  absoluteFilePath: string,
  projectRoot: string,
): string[] {
  const referencingFiles = new Set<string>();
  try {
    const { service, program } = host.getServiceForFile(absoluteFilePath);
    const normalized = toTsPath(absoluteFilePath);
    if (!program.getSourceFile(normalized)) return [];

    const navTree = service.getNavigationTree(normalized);
    for (const item of navTree?.childItems ?? []) {
      if (item.text.startsWith('<') || item.text.startsWith('_')) continue;
      const spans = item.spans;
      if (!spans || spans.length === 0) continue;
      try {
        const references = service.findReferences(normalized, spans[0].start);
        for (const refGroup of references ?? []) {
          for (const ref of refGroup.references) {
            const refFile = ref.fileName;
            if (refFile !== normalized && !refFile.includes('node_modules')) {
              referencingFiles.add(makeRelativePath(refFile, projectRoot));
            }
          }
        }
      } catch {
        // ignore per-symbol reference errors
      }
    }
  } catch (error) {
    logger.warn(`Failed to find references for ${absoluteFilePath}`, String(error));
  }
  return Array.from(referencingFiles);
}
