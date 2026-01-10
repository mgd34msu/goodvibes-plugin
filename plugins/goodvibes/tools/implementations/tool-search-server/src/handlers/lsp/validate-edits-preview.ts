/**
 * Validate Edits Preview Handler
 *
 * Provides MCP tool for validating proposed edits before applying them.
 * Creates virtual snapshots with edits applied and runs TypeScript diagnostics
 * to detect any new errors that would be introduced.
 *
 * Does NOT modify any files - purely a validation/preview operation.
 *
 * @module handlers/lsp/validate-edits-preview
 */

import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  resolveFilePath,
  normalizeFilePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/** A single proposed edit */
export interface ProposedEdit {
  /** File path (relative to project root or absolute) */
  file: string;
  /** Text to replace (for replacement edits) */
  old_text?: string;
  /** Replacement text (used with old_text) */
  new_text?: string;
  /** Full file content (for full file replacement) */
  content?: string;
}

/** Arguments for validate_edits_preview tool */
export interface ValidateEditsPreviewArgs {
  /** List of proposed edits to validate */
  edits: ProposedEdit[];
}

/** Information about which edit caused an error */
interface CausedByEdit {
  file: string;
  edit_index: number;
}

/** A diagnostic error that would be introduced */
interface NewError {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  message: string;
  code: number;
  category: 'error' | 'warning';
  caused_by_edit: CausedByEdit;
}

/** Result for a single edit */
interface EditResult {
  file: string;
  edit_index: number;
  applied: boolean;
  error?: string;
  errors_introduced: number;
}

/** Full validation result */
interface ValidationResult {
  safe: boolean;
  summary: string;
  new_errors: NewError[];
  edit_results: EditResult[];
}

// =============================================================================
// Virtual File System
// =============================================================================

/**
 * Virtual file system that holds modified file contents.
 * Used to create snapshots with edits applied without touching disk.
 */
class VirtualFileSystem {
  private files = new Map<string, string>();

  /**
   * Get file content, preferring virtual content over disk.
   */
  getContent(filePath: string): string | undefined {
    const normalized = normalizeFilePath(filePath);

    // Check virtual FS first
    if (this.files.has(normalized)) {
      return this.files.get(normalized);
    }

    // Fall back to disk
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  /**
   * Set virtual file content.
   */
  setContent(filePath: string, content: string): void {
    const normalized = normalizeFilePath(filePath);
    this.files.set(normalized, content);
  }

  /**
   * Check if file exists (virtual or on disk).
   */
  exists(filePath: string): boolean {
    const normalized = normalizeFilePath(filePath);
    return this.files.has(normalized) || fs.existsSync(filePath);
  }

  /**
   * Get all modified file paths.
   */
  getModifiedFiles(): string[] {
    return Array.from(this.files.keys());
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Apply an edit to file content.
 * Returns [newContent, error] tuple.
 */
function applyEdit(
  currentContent: string | undefined,
  edit: ProposedEdit
): [string | null, string | null] {
  // Full file replacement
  if (edit.content !== undefined) {
    return [edit.content, null];
  }

  // Text replacement
  if (edit.old_text !== undefined && edit.new_text !== undefined) {
    if (currentContent === undefined) {
      return [null, `File does not exist and old_text replacement requires existing file`];
    }

    // Check if old_text exists in the file
    if (!currentContent.includes(edit.old_text)) {
      return [null, `old_text not found in file: "${edit.old_text.slice(0, 50)}${edit.old_text.length > 50 ? '...' : ''}"`];
    }

    // Check for multiple occurrences
    const occurrences = currentContent.split(edit.old_text).length - 1;
    if (occurrences > 1) {
      return [null, `old_text matches ${occurrences} locations in file. Provide more context to make it unique.`];
    }

    const newContent = currentContent.replace(edit.old_text, edit.new_text);
    return [newContent, null];
  }

  return [null, `Invalid edit: must provide either 'content' or both 'old_text' and 'new_text'`];
}

/**
 * Find tsconfig.json by walking up from a directory.
 */
function findTsConfig(startDir: string): string | null {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }

  return null;
}

/**
 * Default compiler options when no tsconfig is found.
 */
const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  noEmit: true,
  resolveJsonModule: true,
  isolatedModules: true,
  allowSyntheticDefaultImports: true,
  forceConsistentCasingInFileNames: true,
};

/**
 * Read and parse tsconfig.json.
 */
function readTsConfig(configPath: string): ts.CompilerOptions {
  const configDir = path.dirname(configPath);
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    return { ...DEFAULT_COMPILER_OPTIONS };
  }

  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
    configDir,
    undefined,
    configPath
  );

  return {
    ...DEFAULT_COMPILER_OPTIONS,
    ...parsed.options,
  };
}

/**
 * Create a language service with virtual file system support.
 */
function createVirtualLanguageService(
  vfs: VirtualFileSystem,
  filesToCheck: string[],
  projectRoot: string
): ts.LanguageService {
  const configPath = findTsConfig(projectRoot);
  const compilerOptions = configPath
    ? readTsConfig(configPath)
    : { ...DEFAULT_COMPILER_OPTIONS };

  const fileVersions = new Map<string, number>();

  // Initialize versions for all files
  for (const file of filesToCheck) {
    const normalized = normalizeFilePath(file);
    fileVersions.set(normalized, 1);
  }

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => filesToCheck.map(normalizeFilePath),
    getScriptVersion: (fileName) => {
      const normalized = normalizeFilePath(fileName);
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
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => vfs.exists(fileName),
    readFile: (fileName) => vfs.getContent(fileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };

  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

/**
 * Get diagnostics for files using a language service.
 */
function getDiagnosticsForFiles(
  service: ts.LanguageService,
  files: string[]
): Map<string, ts.Diagnostic[]> {
  const diagnosticsMap = new Map<string, ts.Diagnostic[]>();

  for (const file of files) {
    const normalized = normalizeFilePath(file);
    try {
      const semanticDiagnostics = service.getSemanticDiagnostics(normalized);
      const syntacticDiagnostics = service.getSyntacticDiagnostics(normalized);

      // Combine and filter to only errors and warnings
      const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics].filter(
        (d) =>
          d.category === ts.DiagnosticCategory.Error ||
          d.category === ts.DiagnosticCategory.Warning
      );

      diagnosticsMap.set(normalized, allDiagnostics);
    } catch {
      // File might not be valid TypeScript, skip
      diagnosticsMap.set(normalized, []);
    }
  }

  return diagnosticsMap;
}

/**
 * Convert TypeScript diagnostic to our error format.
 */
function diagnosticToError(
  diagnostic: ts.Diagnostic,
  causedBy: CausedByEdit,
  projectRoot: string
): NewError | null {
  if (!diagnostic.file || diagnostic.start === undefined) {
    return null;
  }

  const sourceFile = diagnostic.file;
  const start = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
  const end = sourceFile.getLineAndCharacterOfPosition(
    diagnostic.start + (diagnostic.length ?? 0)
  );

  return {
    file: makeRelativePath(sourceFile.fileName, projectRoot),
    line: start.line + 1,
    column: start.character + 1,
    end_line: end.line + 1,
    end_column: end.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    code: typeof diagnostic.code === 'number' ? diagnostic.code : 0,
    category: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
    caused_by_edit: causedBy,
  };
}

/**
 * Create a diagnostic key for deduplication.
 */
function diagnosticKey(d: ts.Diagnostic): string {
  const file = d.file?.fileName ?? 'unknown';
  const start = d.start ?? 0;
  const code = d.code ?? 0;
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  return `${file}:${start}:${code}:${message}`;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle validate_edits_preview MCP tool call.
 *
 * Validates proposed edits by creating virtual snapshots and running
 * TypeScript diagnostics to detect new errors that would be introduced.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with validation results
 */
export async function handleValidateEditsPreview(
  args: ValidateEditsPreviewArgs
): Promise<ToolResponse> {
  const { edits } = args;

  if (!edits || !Array.isArray(edits) || edits.length === 0) {
    return createErrorResponse('edits array is required and must not be empty');
  }

  try {
    // Collect all files that will be affected
    const affectedFiles = new Set<string>();
    const resolvedEdits: Array<{ edit: ProposedEdit; resolvedPath: string; index: number }> = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit.file) {
        return createErrorResponse(`Edit at index ${i} is missing 'file' property`);
      }

      const resolvedPath = resolveFilePath(edit.file, PROJECT_ROOT);
      affectedFiles.add(resolvedPath);
      resolvedEdits.push({ edit, resolvedPath, index: i });
    }

    // Step 1: Get baseline diagnostics (before edits)
    const baselineVfs = new VirtualFileSystem();
    const affectedFilesArray = Array.from(affectedFiles);
    const baselineService = createVirtualLanguageService(
      baselineVfs,
      affectedFilesArray,
      PROJECT_ROOT
    );
    const baselineDiagnostics = getDiagnosticsForFiles(baselineService, affectedFilesArray);

    // Create a set of baseline diagnostic keys for comparison
    const baselineKeys = new Set<string>();
    for (const [, diagnostics] of baselineDiagnostics) {
      for (const d of diagnostics) {
        baselineKeys.add(diagnosticKey(d));
      }
    }

    // Step 2: Apply edits to virtual file system
    const editedVfs = new VirtualFileSystem();
    const editResults: EditResult[] = [];
    const fileToEditIndex = new Map<string, number>();

    for (const { edit, resolvedPath, index } of resolvedEdits) {
      const currentContent = editedVfs.getContent(resolvedPath);
      const [newContent, error] = applyEdit(currentContent, edit);

      const relPath = makeRelativePath(resolvedPath, PROJECT_ROOT);

      if (error) {
        editResults.push({
          file: relPath,
          edit_index: index,
          applied: false,
          error,
          errors_introduced: 0,
        });
      } else if (newContent !== null) {
        editedVfs.setContent(resolvedPath, newContent);
        fileToEditIndex.set(normalizeFilePath(resolvedPath), index);
        editResults.push({
          file: relPath,
          edit_index: index,
          applied: true,
          errors_introduced: 0, // Will be updated after diagnostics
        });
      }
    }

    // Step 3: Get diagnostics after edits
    const editedService = createVirtualLanguageService(
      editedVfs,
      affectedFilesArray,
      PROJECT_ROOT
    );
    const editedDiagnostics = getDiagnosticsForFiles(editedService, affectedFilesArray);

    // Step 4: Find new errors (errors in edited state that weren't in baseline)
    const newErrors: NewError[] = [];
    const errorsPerFile = new Map<string, number>();

    for (const [file, diagnostics] of editedDiagnostics) {
      for (const d of diagnostics) {
        const key = diagnosticKey(d);
        if (!baselineKeys.has(key)) {
          // This is a new error introduced by the edits
          const editIndex = fileToEditIndex.get(file) ?? 0;
          const causedBy: CausedByEdit = {
            file: makeRelativePath(file, PROJECT_ROOT),
            edit_index: editIndex,
          };

          const error = diagnosticToError(d, causedBy, PROJECT_ROOT);
          if (error) {
            newErrors.push(error);

            // Count errors per file
            const count = errorsPerFile.get(file) ?? 0;
            errorsPerFile.set(file, count + 1);
          }
        }
      }
    }

    // Update edit results with error counts
    for (const result of editResults) {
      if (result.applied) {
        const resolvedPath = resolveFilePath(result.file, PROJECT_ROOT);
        const normalized = normalizeFilePath(resolvedPath);
        result.errors_introduced = errorsPerFile.get(normalized) ?? 0;
      }
    }

    // Step 5: Build summary
    const appliedEdits = editResults.filter((r) => r.applied).length;
    const failedEdits = editResults.filter((r) => !r.applied).length;
    const errorCount = newErrors.length;
    const safe = errorCount === 0 && failedEdits === 0;

    let summary: string;
    if (safe) {
      summary = `All ${appliedEdits} edit(s) are safe. No new errors would be introduced.`;
    } else {
      const parts: string[] = [];
      if (failedEdits > 0) {
        parts.push(`${failedEdits} edit(s) could not be applied`);
      }
      if (errorCount > 0) {
        parts.push(`${errorCount} new error(s) would be introduced`);
      }
      summary = parts.join('. ') + '.';
    }

    // Sort new errors by file, then line, then column
    newErrors.sort((a, b) => {
      const fileDiff = a.file.localeCompare(b.file);
      if (fileDiff !== 0) return fileDiff;
      const lineDiff = a.line - b.line;
      if (lineDiff !== 0) return lineDiff;
      return a.column - b.column;
    });

    const result: ValidationResult = {
      safe,
      summary,
      new_errors: newErrors,
      edit_results: editResults,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(message);
  }
}
