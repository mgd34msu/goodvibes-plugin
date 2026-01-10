/**
 * Find Dead Code Handler
 *
 * Finds unused exports and functions in a file or directory by analyzing
 * references using the TypeScript Language Service.
 *
 * @module handlers/lsp/dead-code
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the find_dead_code tool.
 */
export interface FindDeadCodeArgs {
  /** File or directory path to analyze (relative to project root) */
  path?: string;
  /** Count test file references as usage (default: true) */
  include_tests?: boolean;
}

/**
 * A dead (unused) export.
 */
interface DeadExport {
  /** File path relative to project root */
  file: string;
  /** Name of the unused export */
  name: string;
  /** Export kind (function, class, interface, type, variable, etc.) */
  kind: string;
  /** Line number where the export is defined (1-based) */
  line: number;
  /** File that re-exports this symbol (if applicable) */
  exported_from: string | null;
}

/**
 * Result of the find_dead_code tool.
 */
interface FindDeadCodeResult {
  /** Array of dead exports */
  dead_exports: DeadExport[];
  /** Total count of dead exports found */
  count: number;
  /** Number of files that were analyzed */
  files_analyzed: number;
}

/**
 * Internal representation of an export.
 */
interface ExportInfo {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  exportedFrom: string | null;
}

// =============================================================================
// Constants
// =============================================================================

/** Test file patterns to detect */
const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
];

/** TypeScript/JavaScript file extensions */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a file is a test file.
 */
function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return TEST_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if a file is a TypeScript/JavaScript source file.
 */
function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(ext);
}

/**
 * Recursively find all source files in a directory.
 */
function findSourceFiles(dirPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, hidden directories, and build outputs
        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name.startsWith('.') ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'out' ||
            entry.name === 'coverage'
          ) {
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile() && isSourceFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore directories we can't read
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Map TypeScript ScriptElementKind to a simple kind string.
 */
function getExportKind(kind: ts.ScriptElementKind): string {
  const kindMap: Record<string, string> = {
    [ts.ScriptElementKind.functionElement]: 'function',
    [ts.ScriptElementKind.classElement]: 'class',
    [ts.ScriptElementKind.interfaceElement]: 'interface',
    [ts.ScriptElementKind.typeElement]: 'type',
    [ts.ScriptElementKind.enumElement]: 'enum',
    [ts.ScriptElementKind.constElement]: 'constant',
    [ts.ScriptElementKind.letElement]: 'variable',
    [ts.ScriptElementKind.variableElement]: 'variable',
    [ts.ScriptElementKind.moduleElement]: 'namespace',
    [ts.ScriptElementKind.alias]: 'alias',
  };

  return kindMap[kind] ?? 'export';
}

/**
 * Find all exports in a source file using AST traversal.
 */
function findExportsInFile(
  sourceFile: ts.SourceFile,
  service: ts.LanguageService
): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const fileName = sourceFile.fileName;
  const program = service.getProgram();
  const checker = program?.getTypeChecker();

  function visit(node: ts.Node): void {
    // Handle export declarations: export { foo, bar }
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const name = element.name.text;
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            element.getStart()
          );

          // If it's a re-export from another module
          const exportedFrom = node.moduleSpecifier
            ? (node.moduleSpecifier as ts.StringLiteral).text
            : null;

          exports.push({
            name,
            kind: 'export',
            file: fileName,
            line: line + 1,
            column: character + 1,
            exportedFrom,
          });
        }
      }
      // Handle export * from 'module' - skip these, they just re-export
      return;
    }

    // Handle export default
    if (ts.isExportAssignment(node)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      exports.push({
        name: 'default',
        kind: 'export',
        file: fileName,
        line: line + 1,
        column: character + 1,
        exportedFrom: null,
      });
      return;
    }

    // Handle exported declarations: export function foo() {}, export class Bar {}
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasExportModifier = modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    );

    if (hasExportModifier) {
      let name: string | undefined;
      let kind: ts.ScriptElementKind = ts.ScriptElementKind.unknown;

      if (ts.isFunctionDeclaration(node) && node.name) {
        name = node.name.text;
        kind = ts.ScriptElementKind.functionElement;
      } else if (ts.isClassDeclaration(node) && node.name) {
        name = node.name.text;
        kind = ts.ScriptElementKind.classElement;
      } else if (ts.isInterfaceDeclaration(node)) {
        name = node.name.text;
        kind = ts.ScriptElementKind.interfaceElement;
      } else if (ts.isTypeAliasDeclaration(node)) {
        name = node.name.text;
        kind = ts.ScriptElementKind.typeElement;
      } else if (ts.isEnumDeclaration(node)) {
        name = node.name.text;
        kind = ts.ScriptElementKind.enumElement;
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const varName = decl.name.text;
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(
              decl.getStart()
            );
            const varKind =
              node.declarationList.flags & ts.NodeFlags.Const
                ? ts.ScriptElementKind.constElement
                : ts.ScriptElementKind.variableElement;

            exports.push({
              name: varName,
              kind: getExportKind(varKind),
              file: fileName,
              line: line + 1,
              column: character + 1,
              exportedFrom: null,
            });
          }
        }
        return;
      } else if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        name = node.name.text;
        kind = ts.ScriptElementKind.moduleElement;
      }

      if (name) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        exports.push({
          name,
          kind: getExportKind(kind),
          file: fileName,
          line: line + 1,
          column: character + 1,
          exportedFrom: null,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return exports;
}

/**
 * Count references to a symbol, optionally excluding test files.
 */
function countReferences(
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
    // Skip the definition itself
    const refEntry = ref as ts.ReferenceEntry & { isDefinition?: boolean };
    if (refEntry.isDefinition) {
      continue;
    }

    // Skip test files if not including them
    if (!includeTests && isTestFile(ref.fileName)) {
      continue;
    }

    total++;

    // Check if it's an external reference (different file)
    if (ref.fileName !== fileName) {
      external++;
    }
  }

  return { total, external };
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the find_dead_code MCP tool call.
 *
 * Finds unused exports and functions by analyzing references using the
 * TypeScript Language Service.
 *
 * @param args - The find_dead_code tool arguments
 * @returns MCP tool response with JSON-formatted dead exports
 *
 * @example
 * ```typescript
 * const result = await handleFindDeadCode({
 *   path: 'src/utils.ts',
 *   include_tests: true
 * });
 * // Returns dead exports with file, name, kind, line
 * ```
 */
export async function handleFindDeadCode(args: FindDeadCodeArgs): Promise<ToolResponse> {
  try {
    const targetPath = args.path ?? '.';
    const includeTests = args.include_tests ?? true;

    // Resolve the path
    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(PROJECT_ROOT, targetPath);

    // Determine if it's a file or directory
    let filesToAnalyze: string[];
    try {
      const stat = fs.statSync(absolutePath);
      if (stat.isFile()) {
        filesToAnalyze = [absolutePath];
      } else if (stat.isDirectory()) {
        filesToAnalyze = findSourceFiles(absolutePath);
      } else {
        return createErrorResponse(`Path is not a file or directory: ${targetPath}`);
      }
    } catch {
      return createErrorResponse(`Path not found: ${targetPath}`);
    }

    if (filesToAnalyze.length === 0) {
      return createSuccessResponse({
        dead_exports: [],
        count: 0,
        files_analyzed: 0,
      });
    }

    // Skip test files from analysis (we're looking for dead code in non-test files)
    const sourceFilesToAnalyze = filesToAnalyze.filter((f) => !isTestFile(f));

    const deadExports: DeadExport[] = [];

    for (const filePath of sourceFilesToAnalyze) {
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Get language service for this file
      const { service, program } = await languageServiceManager.getServiceForFile(
        normalizedPath
      );

      const sourceFile = program.getSourceFile(normalizedPath);
      if (!sourceFile) {
        continue;
      }

      // Find all exports in this file
      const exports = findExportsInFile(sourceFile, service);

      // Check each export for references
      for (const exp of exports) {
        // Skip default exports for now (they're harder to track accurately)
        if (exp.name === 'default') {
          continue;
        }

        // Get position for the export
        const position = sourceFile.getPositionOfLineAndCharacter(
          exp.line - 1,
          exp.column - 1
        );

        // Count references
        const { external } = countReferences(service, normalizedPath, position, includeTests);

        // If no external references, it's dead code
        if (external === 0) {
          deadExports.push({
            file: makeRelativePath(exp.file, PROJECT_ROOT),
            name: exp.name,
            kind: exp.kind,
            line: exp.line,
            exported_from: exp.exportedFrom,
          });
        }
      }
    }

    // Sort results by file, then by line
    deadExports.sort((a, b) => {
      const fileCompare = a.file.localeCompare(b.file);
      if (fileCompare !== 0) return fileCompare;
      return a.line - b.line;
    });

    const result: FindDeadCodeResult = {
      dead_exports: deadExports,
      count: deadExports.length,
      files_analyzed: sourceFilesToAnalyze.length,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to find dead code: ${message}`);
  }
}
