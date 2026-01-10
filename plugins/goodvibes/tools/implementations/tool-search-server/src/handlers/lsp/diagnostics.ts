/**
 * Diagnostics Handler
 *
 * Provides MCP tools for getting TypeScript diagnostics (errors, warnings,
 * suggestions) with available quick fixes.
 *
 * @module handlers/lsp/diagnostics
 */

import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

import { languageServiceManager } from './language-service.js';
import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  resolveFilePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/** Arguments for get_diagnostics tool */
export interface GetDiagnosticsArgs {
  /** File path (relative to project root or absolute). If not provided, check all project files. */
  file?: string;
  /** Include suggestion diagnostics (default false) */
  include_suggestions?: boolean;
}

/** A text edit for a fix */
interface FixEdit {
  /** File path (relative to project root) */
  file: string;
  /** Start line (1-based) */
  line: number;
  /** Start column (1-based) */
  column: number;
  /** End line (1-based) */
  end_line: number;
  /** End column (1-based) */
  end_column: number;
  /** Text to insert/replace with */
  new_text: string;
}

/** A quick fix for a diagnostic */
interface DiagnosticFix {
  /** Human-readable fix description */
  title: string;
  /** Edits to apply for this fix */
  edits: FixEdit[];
}

/** A diagnostic with position and fix information */
interface DiagnosticInfo {
  /** File path (relative to project root) */
  file: string;
  /** Start line (1-based) */
  line: number;
  /** Start column (1-based) */
  column: number;
  /** End line (1-based) */
  end_line: number;
  /** End column (1-based) */
  end_column: number;
  /** Diagnostic message */
  message: string;
  /** TypeScript error code */
  code: number;
  /** Diagnostic category */
  category: 'error' | 'warning' | 'suggestion' | 'message';
  /** Source of the diagnostic */
  source: string;
  /** Available fixes */
  fixes: DiagnosticFix[];
}

/** Diagnostic counts by category */
interface DiagnosticCounts {
  errors: number;
  warnings: number;
  suggestions: number;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Convert TypeScript DiagnosticCategory to string.
 */
function categoryToString(category: ts.DiagnosticCategory): DiagnosticInfo['category'] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return 'error';
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'suggestion';
    case ts.DiagnosticCategory.Message:
      return 'message';
    default:
      return 'error';
  }
}

/**
 * Get format options for code fixes.
 */
function getFormatOptions(): ts.FormatCodeSettings {
  return {
    indentSize: 2,
    tabSize: 2,
    newLineCharacter: '\n',
    convertTabsToSpaces: true,
    indentStyle: ts.IndentStyle.Smart,
    insertSpaceAfterCommaDelimiter: true,
    insertSpaceAfterSemicolonInForStatements: true,
    insertSpaceBeforeAndAfterBinaryOperators: true,
    insertSpaceAfterKeywordsInControlFlowStatements: true,
    insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
    placeOpenBraceOnNewLineForFunctions: false,
    placeOpenBraceOnNewLineForControlBlocks: false,
    semicolons: ts.SemicolonPreference.Ignore,
  };
}

/**
 * Get user preferences for code fixes.
 */
function getPreferences(): ts.UserPreferences {
  return {
    quotePreference: 'single',
    importModuleSpecifierPreference: 'relative',
    importModuleSpecifierEnding: 'minimal',
    allowTextChangesInNewFiles: true,
    providePrefixAndSuffixTextForRename: true,
    includeCompletionsForModuleExports: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsWithSnippetText: true,
    includeCompletionsWithInsertText: true,
    includeAutomaticOptionalChainCompletions: true,
    includeCompletionsWithObjectLiteralMethodSnippets: true,
    useLabelDetailsInCompletionEntries: true,
    allowIncompleteCompletions: true,
    displayPartsForJSDoc: true,
  };
}

/**
 * Find all TypeScript/JavaScript files in a directory recursively.
 */
function findSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules, .git, and other common non-source directories
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === '.next' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      findSourceFiles(fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Get fixes for a diagnostic.
 */
function getFixesForDiagnostic(
  service: ts.LanguageService,
  filePath: string,
  diagnostic: ts.Diagnostic
): DiagnosticFix[] {
  if (diagnostic.start === undefined || typeof diagnostic.code !== 'number') {
    return [];
  }

  const fixes: DiagnosticFix[] = [];

  try {
    const codeFixes = service.getCodeFixesAtPosition(
      filePath,
      diagnostic.start,
      diagnostic.start + (diagnostic.length ?? 0),
      [diagnostic.code],
      getFormatOptions(),
      getPreferences()
    );

    for (const fix of codeFixes) {
      const edits: FixEdit[] = [];

      for (const change of fix.changes) {
        for (const textChange of change.textChanges) {
          const start = languageServiceManager.getLineAndColumn(
            service,
            change.fileName,
            textChange.span.start
          );
          const end = languageServiceManager.getLineAndColumn(
            service,
            change.fileName,
            textChange.span.start + textChange.span.length
          );

          edits.push({
            file: makeRelativePath(change.fileName, PROJECT_ROOT),
            line: start.line,
            column: start.column,
            end_line: end.line,
            end_column: end.column,
            new_text: textChange.newText,
          });
        }
      }

      fixes.push({
        title: fix.description,
        edits,
      });
    }
  } catch {
    // Ignore errors getting fixes - still return the diagnostic
  }

  return fixes;
}

/**
 * Process diagnostics from a file.
 */
function processDiagnostics(
  service: ts.LanguageService,
  filePath: string,
  diagnostics: readonly ts.Diagnostic[],
  includeSuggestions: boolean
): DiagnosticInfo[] {
  const results: DiagnosticInfo[] = [];

  for (const diagnostic of diagnostics) {
    // Skip suggestion diagnostics if not requested
    if (
      diagnostic.category === ts.DiagnosticCategory.Suggestion &&
      !includeSuggestions
    ) {
      continue;
    }

    // Skip diagnostics without position info
    if (diagnostic.start === undefined || !diagnostic.file) {
      continue;
    }

    const start = languageServiceManager.getLineAndColumn(
      service,
      filePath,
      diagnostic.start
    );
    const end = languageServiceManager.getLineAndColumn(
      service,
      filePath,
      diagnostic.start + (diagnostic.length ?? 0)
    );

    const fixes = getFixesForDiagnostic(service, filePath, diagnostic);

    results.push({
      file: makeRelativePath(filePath, PROJECT_ROOT),
      line: start.line,
      column: start.column,
      end_line: end.line,
      end_column: end.column,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      code: typeof diagnostic.code === 'number' ? diagnostic.code : 0,
      category: categoryToString(diagnostic.category),
      source: 'typescript',
      fixes,
    });
  }

  return results;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle get_diagnostics MCP tool call.
 *
 * Gets all TypeScript diagnostics for a file or the entire project.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with diagnostics and counts
 */
export async function handleGetDiagnostics(args: GetDiagnosticsArgs): Promise<ToolResponse> {
  const includeSuggestions = args.include_suggestions ?? false;

  try {
    const allDiagnostics: DiagnosticInfo[] = [];
    const counts: DiagnosticCounts = {
      errors: 0,
      warnings: 0,
      suggestions: 0,
    };

    if (args.file) {
      // Single file mode
      const filePath = resolveFilePath(args.file, PROJECT_ROOT);

      if (!fs.existsSync(filePath)) {
        return createErrorResponse(`File not found: ${args.file}`, {
          file: args.file,
        });
      }

      const { service } = await languageServiceManager.getServiceForFile(filePath);

      const semanticDiagnostics = service.getSemanticDiagnostics(filePath);
      const syntacticDiagnostics = service.getSyntacticDiagnostics(filePath);
      const suggestionDiagnostics = includeSuggestions
        ? service.getSuggestionDiagnostics(filePath)
        : [];

      const diagnostics = [
        ...processDiagnostics(service, filePath, syntacticDiagnostics, includeSuggestions),
        ...processDiagnostics(service, filePath, semanticDiagnostics, includeSuggestions),
        ...processDiagnostics(service, filePath, suggestionDiagnostics, includeSuggestions),
      ];

      allDiagnostics.push(...diagnostics);
    } else {
      // Project-wide mode: find all source files
      const sourceFiles = findSourceFiles(PROJECT_ROOT);

      if (sourceFiles.length === 0) {
        return createSuccessResponse({
          diagnostics: [],
          counts: { errors: 0, warnings: 0, suggestions: 0 },
          message: 'No TypeScript/JavaScript files found in project',
        });
      }

      // Process files - we need to get a service first to initialize
      // Use the first file to get the service, which will cache it
      const firstFile = sourceFiles[0];
      const { service } = await languageServiceManager.getServiceForFile(firstFile);

      for (const filePath of sourceFiles) {
        try {
          // Ensure file is loaded in service
          await languageServiceManager.getServiceForFile(filePath);

          const semanticDiagnostics = service.getSemanticDiagnostics(filePath);
          const syntacticDiagnostics = service.getSyntacticDiagnostics(filePath);
          const suggestionDiagnostics = includeSuggestions
            ? service.getSuggestionDiagnostics(filePath)
            : [];

          const diagnostics = [
            ...processDiagnostics(service, filePath, syntacticDiagnostics, includeSuggestions),
            ...processDiagnostics(service, filePath, semanticDiagnostics, includeSuggestions),
            ...processDiagnostics(service, filePath, suggestionDiagnostics, includeSuggestions),
          ];

          allDiagnostics.push(...diagnostics);
        } catch {
          // Skip files that can't be processed
          continue;
        }
      }
    }

    // Calculate counts
    for (const diagnostic of allDiagnostics) {
      switch (diagnostic.category) {
        case 'error':
          counts.errors++;
          break;
        case 'warning':
          counts.warnings++;
          break;
        case 'suggestion':
          counts.suggestions++;
          break;
      }
    }

    // Sort diagnostics: errors first, then warnings, then suggestions
    // Within each category, sort by file, then line, then column
    allDiagnostics.sort((a, b) => {
      const categoryOrder = { error: 0, warning: 1, suggestion: 2, message: 3 };
      const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
      if (categoryDiff !== 0) return categoryDiff;

      const fileDiff = a.file.localeCompare(b.file);
      if (fileDiff !== 0) return fileDiff;

      const lineDiff = a.line - b.line;
      if (lineDiff !== 0) return lineDiff;

      return a.column - b.column;
    });

    return createSuccessResponse({
      diagnostics: allDiagnostics,
      counts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(message, {
      file: args.file,
    });
  }
}
