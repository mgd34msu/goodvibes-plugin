/**
 * Safe Delete Check Extension
 *
 * L2 orchestration function that composes L1 utilities
 * to check if a symbol can be safely deleted.
 *
 * @module extensions/code-intel/safe-delete
 */

import { getProjectRoot } from '../../shared/config.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import { normalizePath, toRelativePath } from '../../shared/utils.js';
import {
  languageServiceManager,
  getLinePreview,
  isInSameDeclaration,
} from '../../core/code-intel/index.js';
import { isDefinitionRef } from '../../core/code-intel/ast-utils.js';
import { toOffset, toLineColumn } from '../../core/code-intel/position.js';
import { validatePositionArgs } from '../../core/code-intel/validation.js';
import type {
  SafeDeleteCheckArgs,
  ReferenceLocation,
  SafeDeleteCheckResult,
} from '../../core/code-intel/types.js';

/**
 * Check if a symbol can be safely deleted.
 *
 * Orchestrates: resolve file → get language service → toOffset
 * → getReferencesAtPosition → categorize refs → ok()
 *
 * @param args - The safe_delete_check tool arguments
 * @returns MCP tool response with JSON-formatted safe delete analysis
 *
 * @example
 * ```typescript
 * const result = await checkSafeDelete({ file: 'src/utils.ts', line: 10, column: 5 });
 * // Returns { safe: true/false, external_references: [...], ... }
 * ```
 */
export async function checkSafeDelete(args: SafeDeleteCheckArgs): Promise<McpResponse> {
  try {
    const validation = await validatePositionArgs(args);
    if (!validation.valid) return validation.error;
    const filePath = validation.filePath;

    const projectRoot = getProjectRoot();
    const normalizedFilePath = normalizePath(filePath);

    const { service } = await languageServiceManager.getServiceForFile(normalizedFilePath);

    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(normalizedFilePath);
    if (!sourceFile) {
      return fail(`Could not load source file: ${args.file}`);
    }

    const position = toOffset(sourceFile, args.line, args.column);

    const quickInfo = service.getQuickInfoAtPosition(normalizedFilePath, position);
    let symbolName: string | undefined;
    if (quickInfo) {
      symbolName = quickInfo.displayParts
        ?.map((part) => part.text)
        .join('')
        .split(/[\s(:<]/)[0];
    }

    const references = service.getReferencesAtPosition(normalizedFilePath, position);

    if (!references || references.length === 0) {
      const result: SafeDeleteCheckResult = {
        safe: true,
        external_references: [],
        self_references: [],
        reason: 'No references found. Symbol may not exist or is not referenceable.',
        symbol: symbolName,
      };
      return ok(result);
    }

    // Find the definition position
    let definitionFile: string | undefined;
    let definitionLine: number | undefined;

    for (const ref of references) {
      if (isDefinitionRef(ref)) {
        definitionFile = ref.fileName;
        const defSourceFile = program?.getSourceFile(ref.fileName);
        if (defSourceFile) {
          const { line } = toLineColumn(defSourceFile, ref.textSpan.start);
          definitionLine = line;
        }
        break;
      }
    }

    if (!definitionFile) {
      definitionFile = normalizedFilePath;
      definitionLine = args.line;
    }

    if (!symbolName) {
      if (sourceFile && references[0]) {
        const { start, length } = references[0].textSpan;
        symbolName = sourceFile.text.substring(start, start + length);
      }
    }

    const externalReferences: ReferenceLocation[] = [];
    const selfReferences: ReferenceLocation[] = [];

    for (const ref of references) {
      if (isDefinitionRef(ref)) continue;

      const refSourceFile = program?.getSourceFile(ref.fileName);
      if (!refSourceFile) continue;

      const { line, column } = toLineColumn(refSourceFile, ref.textSpan.start);

      if (definitionFile && definitionLine !== undefined) {
        if (isInSameDeclaration(ref.fileName, line, definitionFile, definitionLine)) {
          continue;
        }
      }

      const preview = getLinePreview(service, ref.fileName, line);
      const relativeFile = toRelativePath(ref.fileName, projectRoot);

      const referenceLocation: ReferenceLocation = { file: relativeFile, line, column, preview };

      const normalizedDefFile = definitionFile ? normalizePath(definitionFile) : undefined;
      const normalizedRefFile = normalizePath(ref.fileName);

      if (normalizedDefFile === normalizedRefFile) {
        selfReferences.push(referenceLocation);
      } else {
        externalReferences.push(referenceLocation);
      }
    }

    const sortRefs = (refs: ReferenceLocation[]) => {
      refs.sort((a, b) => {
        const fileCompare = a.file.localeCompare(b.file);
        if (fileCompare !== 0) return fileCompare;
        const lineCompare = a.line - b.line;
        if (lineCompare !== 0) return lineCompare;
        return a.column - b.column;
      });
    };

    sortRefs(externalReferences);
    sortRefs(selfReferences);

    const isSafe = externalReferences.length === 0;

    let reason: string;
    if (isSafe) {
      reason = selfReferences.length > 0
        ? `Only self-references found (${selfReferences.length} recursive call(s)). Symbol can be safely deleted.`
        : 'No external references found. Symbol can be safely deleted.';
    } else {
      reason = `Symbol has ${externalReferences.length} external reference(s). Deletion would break these usages.`;
    }

    const result: SafeDeleteCheckResult = {
      safe: isSafe,
      external_references: externalReferences,
      self_references: selfReferences,
      reason,
      symbol: symbolName,
    };

    return ok(result);
  /* v8 ignore next 4 -- defensive: catch for unexpected TypeScript service errors */
  } catch (error) {
    return failFromException(error, 'Failed to check safe delete');
  }
}
