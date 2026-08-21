/**
 * Export collection over the shared program's type checker.
 *
 * Ported from project-engine `core/code-intel/exports.ts`. These are pure over a
 * `ts.LanguageService`, the caller acquires it from {@link CompilerHost}. Used
 * by code_surface here and available to lanes 3/4.
 */

import ts from 'typescript';

import { toTsPath } from './paths.js';
import { getExportKind, getJsDoc, getTypeString } from './ast-utils.js';
import type { ExportInfo } from './types.js';

/** An export with the file it originates from and whether it is entry-visible. */
export interface ExportWithOrigin {
  name: string;
  kind: string;
  type: string;
  file: string;
  line: number;
  jsdoc: string | null;
  isFromEntryPoint: boolean;
}

/**
 * Find syntactic exports in a source file via AST traversal.
 * @param sourceFile - the source file to scan
 * @returns export descriptors (name, kind, position, re-export origin)
 */
export function findExportsInFile(sourceFile: ts.SourceFile): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const fileName = sourceFile.fileName;

  function visit(node: ts.Node): void {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(element.getStart());
          const exportedFrom = node.moduleSpecifier
            ? (node.moduleSpecifier as ts.StringLiteral).text
            : null;
          exports.push({
            name: element.name.text,
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

    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasExportModifier = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

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
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
            const varKind =
              node.declarationList.flags & ts.NodeFlags.Const
                ? ts.ScriptElementKind.constElement
                : ts.ScriptElementKind.variableElement;
            exports.push({
              name: decl.name.text,
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

/** Shared collector: exports of a set of files, via the type checker. */
function collectExportsFromFiles(
  files: string[],
  service: ts.LanguageService,
  options: { isFromEntryPoint: boolean; deduplicateByKey: boolean },
): Map<string, ExportWithOrigin> {
  const result = new Map<string, ExportWithOrigin>();
  const program = service.getProgram();
  const checker = program?.getTypeChecker();
  if (!program || !checker) {return result;}

  for (const filePath of files) {
    const sourceFile = program.getSourceFile(toTsPath(filePath));
    if (!sourceFile) {continue;}

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {continue;}

    for (const exportSymbol of checker.getExportsOfModule(moduleSymbol)) {
      const name = exportSymbol.getName();
      if (name === '__export') {continue;}

      const declarations = exportSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) {continue;}

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
          kind =
            varStmt.declarationList.flags & ts.NodeFlags.Const
              ? ts.ScriptElementKind.constElement
              : ts.ScriptElementKind.variableElement;
        }
      } else if (ts.isModuleDeclaration(decl)) {
        kind = ts.ScriptElementKind.moduleElement;
      }

      const key = `${name}@${declSourceFile.fileName}`;
      if (!options.deduplicateByKey || !result.has(key)) {
        result.set(key, {
          name,
          kind: getExportKind(kind),
          type: getTypeString(checker, decl, exportSymbol),
          file: declSourceFile.fileName,
          line: line + 1,
          jsdoc: getJsDoc(decl),
          isFromEntryPoint: options.isFromEntryPoint,
        });
      }
    }
  }

  return result;
}

/**
 * Collect exports reachable from entry-point files (the public surface).
 * @param entryPoints - absolute entry-point paths
 * @param service - a language service with those files loaded
 */
export function collectPublicExports(
  entryPoints: string[],
  service: ts.LanguageService,
): Map<string, ExportWithOrigin> {
  return collectExportsFromFiles(entryPoints, service, {
    isFromEntryPoint: true,
    deduplicateByKey: false,
  });
}

/**
 * Collect exports from every source file (public ∪ internal).
 * @param sourceFiles - absolute source paths
 * @param service - a language service with those files loaded
 */
export function collectAllExports(
  sourceFiles: string[],
  service: ts.LanguageService,
): Map<string, ExportWithOrigin> {
  return collectExportsFromFiles(sourceFiles, service, {
    isFromEntryPoint: false,
    deduplicateByKey: true,
  });
}
