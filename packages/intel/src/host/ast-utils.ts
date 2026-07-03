/**
 * AST helpers shared by the export collectors and reference analyzers.
 *
 * Ported verbatim from project-engine `core/code-intel/ast-utils.ts`.
 */

import ts from 'typescript';

/** Map a TypeScript ScriptElementKind to a simple kind string. */
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

/**
 * True when a reference entry is the definition site (TS 5.x removed the older
 * `isDefinition` guarantee, so this is defensive).
 * @param ref - a reference entry
 */
export function isDefinitionRef(ref: ts.ReferenceEntry): boolean {
  return (ref as ts.ReferenceEntry & { isDefinition?: boolean }).isDefinition === true;
}

/**
 * Map a ScriptElementKind to a display kind string ('export' fallback).
 * @param kind - the script element kind
 */
export function getExportKind(kind: ts.ScriptElementKind): string {
  return kindMap[kind] ?? 'export';
}

/**
 * Extract JSDoc comment text for a node, or null when it has none.
 * @param node - the AST node
 */
export function getJsDoc(node: ts.Node): string | null {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) {return null;}

  const comments: string[] = [];
  for (const doc of jsDocs) {
    if (ts.isJSDoc(doc) && doc.comment) {
      if (typeof doc.comment === 'string') {
        comments.push(doc.comment);
      } else {
        comments.push(doc.comment.map((c) => (typeof c === 'string' ? c : c.text)).join(''));
      }
    }
  }

  return comments.length > 0 ? comments.join('\n').trim() : null;
}

/**
 * Render the type string for a node/symbol via the type checker, or 'unknown'.
 * @param checker - the program's type checker
 * @param node - the AST node providing type context
 * @param symbol - optional symbol to type at the node
 */
export function getTypeString(checker: ts.TypeChecker, node: ts.Node, symbol?: ts.Symbol): string {
  try {
    if (symbol) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, node);
      return checker.typeToString(
        type,
        node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature,
      );
    }
    const type = checker.getTypeAtLocation(node);
    return checker.typeToString(
      type,
      node,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature,
    );
  } catch {
    return 'unknown';
  }
}
