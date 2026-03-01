/**
 * Validate Edits Preview Extension
 *
 * L2 orchestration function that composes L1 virtual-fs and diagnostics
 * utilities to validate proposed edits without writing to disk.
 *
 * @module extensions/code-intel/preview-edits
 */

// PROJECT_ROOT is used as a constant (not getProjectRoot()) to ensure consistent path
// resolution across async calls within a single tool invocation.
import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import { normalizePath, toRelativePath, resolveProjectPath } from '../../shared/utils.js';
import {
  VirtualFileSystem,
  applyEdit,
  createVirtualLanguageService,
  getDiagnosticsForFiles,
  diagnosticToError,
  diagnosticKey,
} from '../../core/code-intel/index.js';
import type { ValidateEditsPreviewArgs, ProposedEdit } from '../../core/code-intel/types.js';
import type { CausedByEdit } from '../../core/code-intel/diagnostics.js';

/**
 * Validate proposed edits by applying them to a virtual file system
 * and running TypeScript diagnostics to detect any new errors.
 *
 * Orchestrates: collect affected files → baseline diagnostics
 * → apply edits to VFS → post-edit diagnostics → diff new errors → ok()
 *
 * @param args - The validate_edits_preview tool arguments
 * @returns MCP tool response with validation results
 *
 * @example
 * ```typescript
 * const result = await validateEditsPreview({
 *   edits: [{ file: 'src/utils.ts', old_text: 'foo', new_text: 'bar' }]
 * });
 * // Returns { safe: true/false, new_errors: [...], edit_results: [...] }
 * ```
 */
export async function validateEditsPreview(args: ValidateEditsPreviewArgs): Promise<McpResponse> {
  const { edits } = args;

  if (!edits || !Array.isArray(edits) || edits.length === 0) {
    return fail('edits array is required and must not be empty');
  }

  try {
    const affectedFiles = new Set<string>();
    const resolvedEdits: Array<{ edit: ProposedEdit; resolvedPath: string; index: number }> = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit.file) {
        return fail(`Edit at index ${i} is missing 'file' property`);
      }
      const resolvedPath = resolveProjectPath(edit.file, PROJECT_ROOT);
      affectedFiles.add(resolvedPath);
      resolvedEdits.push({ edit, resolvedPath, index: i });
    }

    const affectedFilesArray = Array.from(affectedFiles);

    // Step 1: Baseline diagnostics
    const baselineVfs = new VirtualFileSystem();
    const baselineService = await createVirtualLanguageService(
      baselineVfs,
      affectedFilesArray,
      PROJECT_ROOT
    );
    const baselineDiagnostics = getDiagnosticsForFiles(baselineService, affectedFilesArray);
    baselineService.dispose();

    const baselineKeys = new Set<string>();
    for (const [, diagnostics] of baselineDiagnostics) {
      for (const d of diagnostics) {
        baselineKeys.add(diagnosticKey(d));
      }
    }

    // Step 2: Apply edits to virtual FS
    const editedVfs = new VirtualFileSystem();
    const editResults: Array<{
      file: string;
      edit_index: number;
      applied: boolean;
      error?: string;
      errors_introduced: number;
    }> = [];
    const fileToEditIndex = new Map<string, number>();

    for (const { edit, resolvedPath, index } of resolvedEdits) {
      const currentContent = editedVfs.getContent(resolvedPath);
      const [newContent, error] = applyEdit(currentContent, edit);
      const relPath = toRelativePath(resolvedPath, PROJECT_ROOT);

      if (error) {
        editResults.push({ file: relPath, edit_index: index, applied: false, error, errors_introduced: 0 });
      } else if (newContent !== null) {
        editedVfs.setContent(resolvedPath, newContent);
        fileToEditIndex.set(normalizePath(resolvedPath), index);
        editResults.push({ file: relPath, edit_index: index, applied: true, errors_introduced: 0 });
      }
    }

    // Step 3: Post-edit diagnostics
    const editedService = await createVirtualLanguageService(
      editedVfs,
      affectedFilesArray,
      PROJECT_ROOT
    );
    const editedDiagnostics = getDiagnosticsForFiles(editedService, affectedFilesArray);
    editedService.dispose();

    // Step 4: Find new errors
    const newErrors: ReturnType<typeof diagnosticToError>[] = [];
    const errorsPerFile = new Map<string, number>();

    for (const [file, diagnostics] of editedDiagnostics) {
      for (const d of diagnostics) {
        const key = diagnosticKey(d);
        if (!baselineKeys.has(key)) {
          const editIndex = fileToEditIndex.get(file) ?? 0;
          const causedBy: CausedByEdit = {
            file: toRelativePath(file, PROJECT_ROOT),
            edit_index: editIndex,
          };
          const error = diagnosticToError(d, causedBy, PROJECT_ROOT);
          if (error) {
            newErrors.push(error);
            errorsPerFile.set(file, (errorsPerFile.get(file) ?? 0) + 1);
          }
        }
      }
    }

    // Step 5: Update error counts in edit results
    for (const result of editResults) {
      if (result.applied) {
        const resolvedPath = resolveProjectPath(result.file, PROJECT_ROOT);
        const normalized = normalizePath(resolvedPath);
        result.errors_introduced = errorsPerFile.get(normalized) ?? 0;
      }
    }

    const appliedEdits = editResults.filter((r) => r.applied).length;
    const failedEdits = editResults.filter((r) => !r.applied).length;
    const errorCount = newErrors.length;
    const safe = errorCount === 0 && failedEdits === 0;

    let summary: string;
    if (safe) {
      summary = `All ${appliedEdits} edit(s) are safe. No new errors would be introduced.`;
    } else {
      const parts: string[] = [];
      if (failedEdits > 0) parts.push(`${failedEdits} edit(s) could not be applied`);
      if (errorCount > 0) parts.push(`${errorCount} new error(s) would be introduced`);
      summary = parts.join('. ') + '.';
    }

    newErrors.sort((a, b) => {
      if (!a || !b) return 0;
      const fileDiff = a.file.localeCompare(b.file);
      if (fileDiff !== 0) return fileDiff;
      const lineDiff = a.line - b.line;
      if (lineDiff !== 0) return lineDiff;
      return a.column - b.column;
    });

    return ok({ safe, summary, new_errors: newErrors, edit_results: editResults });
  } catch (error) {
    return failFromException(error);
  }
}
