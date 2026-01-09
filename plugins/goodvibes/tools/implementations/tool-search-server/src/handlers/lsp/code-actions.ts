/**
 * Code Actions Handler
 *
 * Provides MCP tools for getting and applying code actions (quick fixes,
 * refactorings) at a position in TypeScript/JavaScript files.
 *
 * @module handlers/lsp/code-actions
 */

import ts from 'typescript';
import * as path from 'path';
import * as crypto from 'crypto';

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

/** Arguments for get_code_actions tool */
export interface GetCodeActionsArgs {
  /** File path (relative to project root or absolute) */
  file: string;
  /** Start line number (1-based) */
  line: number;
  /** Start column number (1-based) */
  column: number;
  /** End line number (optional, for range) */
  end_line?: number;
  /** End column number (optional, for range) */
  end_column?: number;
  /** Filter by action kind (e.g., "quickfix", "refactor") */
  only?: string[];
}

/** Arguments for apply_code_action tool */
export interface ApplyCodeActionArgs {
  /** File path where the action was retrieved */
  file: string;
  /** Line where the action was retrieved */
  line: number;
  /** Column where the action was retrieved */
  column: number;
  /** The exact title of the action to apply */
  action_title: string;
}

/** A text edit to apply */
interface TextEdit {
  /** File path (relative to project root) */
  file: string;
  /** Start position */
  start: { line: number; column: number };
  /** End position */
  end: { line: number; column: number };
  /** Text to insert/replace with */
  new_text: string;
}

/** A code action with edits */
interface CodeAction {
  /** Unique identifier for this action */
  id: string;
  /** Human-readable title */
  title: string;
  /** Action kind (e.g., "quickfix", "refactor.extract") */
  kind: string;
  /** Whether this is the preferred action for the diagnostic */
  is_preferred: boolean;
  /** File edits to apply */
  edits: TextEdit[];
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a unique ID for a code action.
 */
function generateActionId(title: string, file: string, line: number, column: number): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${title}:${file}:${line}:${column}`)
    .digest('hex')
    .substring(0, 12);
  return hash;
}

/**
 * Convert TypeScript's format options to CodeFixesAtPosition options.
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

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handle get_code_actions MCP tool call.
 *
 * Gets available code actions (quick fixes, refactorings) at a position or range.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with available code actions
 */
export async function handleGetCodeActions(args: GetCodeActionsArgs): Promise<ToolResponse> {
  const filePath = resolveFilePath(args.file, PROJECT_ROOT);
  const relativeFile = makeRelativePath(filePath, PROJECT_ROOT);

  try {
    const { service } = await languageServiceManager.getServiceForFile(filePath);

    // Get positions
    const startPos = languageServiceManager.getPositionOffset(
      service,
      filePath,
      args.line,
      args.column
    );

    const endPos = args.end_line !== undefined && args.end_column !== undefined
      ? languageServiceManager.getPositionOffset(
          service,
          filePath,
          args.end_line,
          args.end_column
        )
      : startPos;

    // Get diagnostics that overlap with the range
    const semanticDiagnostics = service.getSemanticDiagnostics(filePath);
    const syntacticDiagnostics = service.getSyntacticDiagnostics(filePath);
    const suggestionDiagnostics = service.getSuggestionDiagnostics(filePath);

    const allDiagnostics = [
      ...semanticDiagnostics,
      ...syntacticDiagnostics,
      ...suggestionDiagnostics,
    ];

    // Filter diagnostics to those overlapping the range
    const overlappingDiagnostics = allDiagnostics.filter((d) => {
      if (d.start === undefined) return false;
      const diagEnd = d.start + (d.length ?? 0);
      return d.start <= endPos && diagEnd >= startPos;
    });

    // Extract error codes
    const errorCodes = overlappingDiagnostics
      .map((d) => d.code)
      .filter((code): code is number => typeof code === 'number');

    // Get code fixes
    const fixes = service.getCodeFixesAtPosition(
      filePath,
      startPos,
      endPos,
      errorCodes.length > 0 ? errorCodes : [0], // Use 0 to get all fixes if no specific errors
      getFormatOptions(),
      getPreferences()
    );

    // Also get refactorings if requested or no filters
    const refactorInfos = service.getApplicableRefactors(
      filePath,
      { pos: startPos, end: endPos },
      getPreferences()
    );

    // Convert fixes to CodeAction format
    const actions: CodeAction[] = [];

    // Add code fixes
    for (const fix of fixes) {
      const edits: TextEdit[] = [];

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
            start,
            end,
            new_text: textChange.newText,
          });
        }
      }

      const action: CodeAction = {
        id: generateActionId(fix.description, relativeFile, args.line, args.column),
        title: fix.description,
        kind: `quickfix.${fix.fixName}`,
        is_preferred: fix.fixAllDescription !== undefined,
        edits,
      };

      actions.push(action);
    }

    // Add refactorings
    for (const refactor of refactorInfos) {
      for (const refactorAction of refactor.actions) {
        // Get the actual edits for this refactoring
        const editInfo = service.getEditsForRefactor(
          filePath,
          getFormatOptions(),
          { pos: startPos, end: endPos },
          refactor.name,
          refactorAction.name,
          getPreferences()
        );

        if (editInfo) {
          const edits: TextEdit[] = [];

          for (const change of editInfo.edits) {
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
                start,
                end,
                new_text: textChange.newText,
              });
            }
          }

          const action: CodeAction = {
            id: generateActionId(refactorAction.description, relativeFile, args.line, args.column),
            title: refactorAction.description,
            kind: `refactor.${refactor.name}.${refactorAction.name}`,
            is_preferred: 'isPreferred' in refactorAction ? !!refactorAction.isPreferred : false,
            edits,
          };

          actions.push(action);
        }
      }
    }

    // Filter by kind if requested
    const filteredActions = args.only
      ? actions.filter((a) => args.only!.some((kind) => a.kind.includes(kind)))
      : actions;

    // Include diagnostic info for context
    const diagnosticsInfo = overlappingDiagnostics.map((d) => {
      const pos = d.start !== undefined
        ? languageServiceManager.getLineAndColumn(service, filePath, d.start)
        : { line: 0, column: 0 };

      return {
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        line: pos.line,
        column: pos.column,
        category: ts.DiagnosticCategory[d.category].toLowerCase(),
      };
    });

    return createSuccessResponse({
      actions: filteredActions,
      count: filteredActions.length,
      diagnostics: diagnosticsInfo,
      position: {
        file: relativeFile,
        line: args.line,
        column: args.column,
        end_line: args.end_line,
        end_column: args.end_column,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(message, {
      file: relativeFile,
      line: args.line,
      column: args.column,
    });
  }
}

/**
 * Handle apply_code_action MCP tool call.
 *
 * Retrieves the edits for a code action by regenerating it at the given position.
 * Does not actually apply the edits - returns them for the caller to apply.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with file edits to apply
 */
export async function handleApplyCodeAction(args: ApplyCodeActionArgs): Promise<ToolResponse> {
  const filePath = resolveFilePath(args.file, PROJECT_ROOT);
  const relativeFile = makeRelativePath(filePath, PROJECT_ROOT);

  try {
    const { service } = await languageServiceManager.getServiceForFile(filePath);

    // Get position
    const position = languageServiceManager.getPositionOffset(
      service,
      filePath,
      args.line,
      args.column
    );

    // Get diagnostics at position
    const semanticDiagnostics = service.getSemanticDiagnostics(filePath);
    const syntacticDiagnostics = service.getSyntacticDiagnostics(filePath);
    const suggestionDiagnostics = service.getSuggestionDiagnostics(filePath);

    const allDiagnostics = [
      ...semanticDiagnostics,
      ...syntacticDiagnostics,
      ...suggestionDiagnostics,
    ];

    // Extract error codes
    const errorCodes = allDiagnostics
      .filter((d) => {
        if (d.start === undefined) return false;
        const diagEnd = d.start + (d.length ?? 0);
        return d.start <= position && diagEnd >= position;
      })
      .map((d) => d.code)
      .filter((code): code is number => typeof code === 'number');

    // Get code fixes
    const fixes = service.getCodeFixesAtPosition(
      filePath,
      position,
      position,
      errorCodes.length > 0 ? errorCodes : [0],
      getFormatOptions(),
      getPreferences()
    );

    // Find the matching fix by title
    let matchingFix = fixes.find((f) => f.description === args.action_title);

    // If not found in fixes, check refactorings
    if (!matchingFix) {
      const refactorInfos = service.getApplicableRefactors(
        filePath,
        { pos: position, end: position },
        getPreferences()
      );

      for (const refactor of refactorInfos) {
        for (const refactorAction of refactor.actions) {
          if (refactorAction.description === args.action_title) {
            const editInfo = service.getEditsForRefactor(
              filePath,
              getFormatOptions(),
              { pos: position, end: position },
              refactor.name,
              refactorAction.name,
              getPreferences()
            );

            if (editInfo) {
              const edits: TextEdit[] = [];

              for (const change of editInfo.edits) {
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
                    start,
                    end,
                    new_text: textChange.newText,
                  });
                }
              }

              return createSuccessResponse({
                success: true,
                action_title: args.action_title,
                edits,
                files_affected: [...new Set(edits.map((e) => e.file))],
              });
            }
          }
        }
      }

      // Not found
      return createErrorResponse(`Code action not found: "${args.action_title}"`, {
        suggestion: 'Run get_code_actions first to see available actions',
        file: relativeFile,
        line: args.line,
        column: args.column,
      });
    }

    // Convert fix to edits
    const edits: TextEdit[] = [];

    for (const change of matchingFix.changes) {
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
          start,
          end,
          new_text: textChange.newText,
        });
      }
    }

    return createSuccessResponse({
      success: true,
      action_title: args.action_title,
      edits,
      files_affected: [...new Set(edits.map((e) => e.file))],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(message, {
      file: relativeFile,
      line: args.line,
      column: args.column,
    });
  }
}
