/**
 * Export Collection Utilities
 *
 * Deduplicated from dead-code.ts and api-surface.ts.
 * Provides functions to find and collect exported symbols from TypeScript source files.
 *
 * @module core/code-intel/exports
 */

import ts from 'typescript';

import { logWarn } from '../../shared/logger.js';
import { normalizePath } from '../../shared/utils.js';
import { getExportKind, getJsDoc, getTypeString } from './ast-utils.js';
import type { ExportInfo } from './types.js';

/**
 * Internal symbol with references for semantic analysis.
 */
export interface SymbolWithReferences {
  /** Symbol name */
  name: string;
  /** Symbol kind string */
  kind: string;
  /** Type signature */
  signature: string;
  /** Line number (1-based) */
  line: number;
  /** Files referencing this symbol */
  references: string[];
}

/**
 * Internal export representation with origin info for API surface analysis.
 */
export interface ExportWithOrigin {
  /** Symbol name */
  name: string;
  /** Symbol kind string */
  kind: string;
  /** TypeScript type string */
  type: string;
  /** Absolute file path where symbol is defined */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** JSDoc comment, or null */
  jsdoc: string | null;
  /** True if exported from an entry point */
  isFromEntryPoint: boolean;
}

/**
 * Find all exports in a source file using AST traversal.
 *
 * @param sourceFile - The TypeScript source file to analyze
 * @param service - The TypeScript language service (for type context)
 * @returns Array of export info objects
 */
export function findExportsInFile(
  sourceFile: ts.SourceFile,
  service: ts.LanguageService
): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const fileName = sourceFile.fileName;
  const program = service.getProgram();

  function visit(node: ts.Node): void {
    // Handle export declarations: export { foo, bar }
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const name = element.name.text;
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            element.getStart()
          );

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
 * Extract exported symbol signatures from file content (for semantic diff).
 * Creates a temporary source file for analysis.
 *
 * @param content - The file content string
 * @param fileName - The file name (used as identifier)
 * @returns Array of symbols with references placeholder
 */
export function extractExportedSymbols(
  content: string,
  fileName: string
): SymbolWithReferences[] {
  const symbols: SymbolWithReferences[] = [];

  try {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    function visit(node: ts.Node): void {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

      if (isExported) {
        let name = '';
        let kind = '';
        let signature = '';

        if (ts.isFunctionDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'function';
          signature = node.getText(sourceFile).split('{')[0].trim();
        } else if (ts.isClassDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'class';
          const classText = node.getText(sourceFile);
          const braceIndex = classText.indexOf('{');
          signature = braceIndex > 0 ? classText.slice(0, braceIndex).trim() : classText;
        } else if (ts.isInterfaceDeclaration(node)) {
          name = node.name.text;
          kind = 'interface';
          signature = node.getText(sourceFile);
        } else if (ts.isTypeAliasDeclaration(node)) {
          name = node.name.text;
          kind = 'type';
          signature = node.getText(sourceFile);
        } else if (ts.isVariableStatement(node)) {
          const declarations = node.declarationList.declarations;
          for (const decl of declarations) {
            if (ts.isIdentifier(decl.name)) {
              const varName = decl.name.text;
              const varKind =
                node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'variable';
              const varSig = decl.getText(sourceFile);
              const { line } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
              symbols.push({
                name: varName,
                kind: varKind,
                signature: varSig.length > 200 ? varSig.slice(0, 200) + '...' : varSig,
                line: line + 1,
                references: [],
              });
            }
          }
          return;
        } else if (ts.isEnumDeclaration(node)) {
          name = node.name.text;
          kind = 'enum';
          signature = node.getText(sourceFile);
        }

        if (name) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          symbols.push({
            name,
            kind,
            signature: signature.length > 200 ? signature.slice(0, 200) + '...' : signature,
            line: line + 1,
            references: [],
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch (err) {
    logWarn('[exports] Failed to parse file for exported symbols:', err);
  }

  return symbols;
}

/**
 * Shared implementation for collecting exports from a set of source files.
 *
 * @param files - Array of absolute file paths to process
 * @param service - TypeScript language service
 * @param options - Collection options
 * @param options.isFromEntryPoint - Whether to mark exports as from an entry point
 * @param options.deduplicateByKey - Whether to skip already-seen export keys
 * @returns Map from symbol key to export info
 */
function collectExportsFromFiles(
  files: string[],
  service: ts.LanguageService,
  options: { isFromEntryPoint: boolean; deduplicateByKey: boolean }
): Map<string, ExportWithOrigin> {
  const result = new Map<string, ExportWithOrigin>();
  const program = service.getProgram();
  const checker = program?.getTypeChecker();

  if (!program || !checker) {
    return result;
  }

  for (const filePath of files) {
    const normalizedPath = normalizePath(filePath);
    const sourceFile = program.getSourceFile(normalizedPath);

    if (!sourceFile) continue;

    const symbol = checker.getSymbolAtLocation(sourceFile);
    if (!symbol) continue;

    const exports = checker.getExportsOfModule(symbol);

    for (const exportSymbol of exports) {
      const name = exportSymbol.getName();
      if (name === '__export') continue;

      const declarations = exportSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) continue;

      const decl = declarations[0];
      const declSourceFile = decl.getSourceFile();
      const { line } = declSourceFile.getLineAndCharacterOfPosition(decl.getStart());

      let kind: ts.ScriptElementKind = ts.ScriptElementKind.unknown;
      if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
        kind = ts.ScriptElementKind.functionElement;
      } else if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) {
        kind = ts.ScriptElementKind.classElement;
      } else if (ts.isInterfaceDeclaration(decl)) {
        kind = ts.ScriptElementKind.interfaceElement;
      } else if (ts.isTypeAliasDeclaration(decl)) {
        kind = ts.ScriptElementKind.typeElement;
      } else if (ts.isEnumDeclaration(decl)) {
        kind = ts.ScriptElementKind.enumElement;
      } else if (ts.isVariableDeclaration(decl)) {
        const varStmt = decl.parent?.parent;
        if (varStmt && ts.isVariableStatement(varStmt)) {
          kind = varStmt.declarationList.flags & ts.NodeFlags.Const
            ? ts.ScriptElementKind.constElement
            : ts.ScriptElementKind.variableElement;
        }
      } else if (ts.isModuleDeclaration(decl)) {
        kind = ts.ScriptElementKind.moduleElement;
      }

      const typeStr = getTypeString(checker, decl, exportSymbol);
      const jsdoc = getJsDoc(decl);
      const key = `${name}@${declSourceFile.fileName}`;

      if (!options.deduplicateByKey || !result.has(key)) {
        result.set(key, {
          name,
          kind: getExportKind(kind),
          type: typeStr,
          file: declSourceFile.fileName,
          line: line + 1,
          jsdoc,
          isFromEntryPoint: options.isFromEntryPoint,
        });
      }
    }
  }

  return result;
}

/**
 * Collect all exports from entry point files using the type checker.
 *
 * @param entryPoints - Array of absolute entry point file paths
 * @param service - TypeScript language service
 * @returns Map from symbol key to export info
 */
export function collectPublicExports(
  entryPoints: string[],
  service: ts.LanguageService
): Map<string, ExportWithOrigin> {
  return collectExportsFromFiles(entryPoints, service, { isFromEntryPoint: true, deduplicateByKey: false });
}

/**
 * Collect all exports from all source files using the type checker.
 *
 * @param sourceFiles - Array of absolute source file paths
 * @param service - TypeScript language service
 * @returns Map from symbol key to export info
 */
export function collectAllExports(
  sourceFiles: string[],
  service: ts.LanguageService
): Map<string, ExportWithOrigin> {
  return collectExportsFromFiles(sourceFiles, service, { isFromEntryPoint: false, deduplicateByKey: true });
}
