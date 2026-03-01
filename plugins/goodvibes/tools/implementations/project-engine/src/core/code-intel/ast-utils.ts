/**
 * AST Utility Functions for Code Intelligence
 *
 * Deduplicated from dead-code.ts and api-surface.ts.
 * Provides common TypeScript AST analysis helpers.
 *
 * @module core/code-intel/ast-utils
 */

import ts from 'typescript';

/**
 * Map TypeScript ScriptElementKind to a simple kind string.
 *
 * @param kind - The TypeScript script element kind
 * @returns A human-readable kind string
 */
export function getExportKind(kind: ts.ScriptElementKind): string {
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
 * Get JSDoc comment text for a TypeScript AST node.
 *
 * @param node - The TypeScript AST node
 * @param _sourceFile - The source file (for context, unused directly)
 * @returns JSDoc comment string, or null if none
 */
export function getJsDoc(node: ts.Node, _sourceFile?: ts.SourceFile): string | null {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return null;

  const comments: string[] = [];
  for (const doc of jsDocs) {
    if (ts.isJSDoc(doc) && doc.comment) {
      if (typeof doc.comment === 'string') {
        comments.push(doc.comment);
      } else {
        comments.push(
          doc.comment
            .map((c) => (typeof c === 'string' ? c : c.text))
            .join('')
        );
      }
    }
  }

  return comments.length > 0 ? comments.join('\n').trim() : null;
}

/**
 * Get the type string for a symbol or node using the TypeScript type checker.
 *
 * @param checker - The TypeScript type checker
 * @param node - The AST node
 * @param symbol - Optional symbol to get type from
 * @returns TypeScript type string, or 'unknown' on error
 */
export function getTypeString(
  checker: ts.TypeChecker,
  node: ts.Node,
  symbol?: ts.Symbol
): string {
  try {
    if (symbol) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, node);
      return checker.typeToString(
        type,
        node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature
      );
    }

    const type = checker.getTypeAtLocation(node);
    return checker.typeToString(
      type,
      node,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature
    );
  } catch {
    return 'unknown';
  }
}
