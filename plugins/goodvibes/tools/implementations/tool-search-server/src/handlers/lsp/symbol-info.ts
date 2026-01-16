/**
 * Get Symbol Info Handler
 *
 * Retrieves detailed information about a symbol at a given position.
 * Uses the TypeScript Language Service to get type info, documentation,
 * and definition location.
 *
 * @module handlers/lsp/symbol-info
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../../config.js';
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

export interface GetSymbolInfoArgs {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

interface DefinitionLocation {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

interface SymbolInfoResult {
  /** Symbol name */
  symbol: string;
  /** Symbol kind (variable, function, class, etc.) */
  kind: string;
  /** TypeScript type signature */
  type: string;
  /** JSDoc documentation if available */
  documentation: string;
  /** Location where the symbol is defined */
  definition: DefinitionLocation | null;
  /** Modifiers (export, async, const, etc.) */
  modifiers: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map TypeScript ScriptElementKind to a user-friendly kind string.
 */
function mapScriptElementKind(kind: ts.ScriptElementKind): string {
  const kindMap: { [key: string]: string } = {
    'unknown': 'unknown',
    'warning': 'warning',
    'keyword': 'keyword',
    'script': 'script',
    'module': 'module',
    'class': 'class',
    'local class': 'class',
    'interface': 'interface',
    'type': 'type',
    'enum': 'enum',
    'enum member': 'enum-member',
    'var': 'variable',
    'local var': 'variable',
    'function': 'function',
    'local function': 'function',
    'method': 'method',
    'getter': 'getter',
    'setter': 'setter',
    'property': 'property',
    'constructor': 'constructor',
    'call': 'call-signature',
    'index': 'index-signature',
    'construct': 'construct-signature',
    'parameter': 'parameter',
    'type parameter': 'type-parameter',
    'primitive type': 'primitive',
    'label': 'label',
    'alias': 'alias',
    'const': 'const',
    'let': 'let',
    'directory': 'directory',
    'external module name': 'external-module',
    'JSX attribute': 'jsx-attribute',
    'string': 'string',
    'link': 'link',
    'link name': 'link-name',
    'link text': 'link-text',
    'using': 'using',
    'await using': 'await-using',
    'accessor': 'accessor',
  };

  return kindMap[kind] ?? 'unknown';
}

/**
 * Convert display parts to a string.
 */
function displayPartsToString(parts: ts.SymbolDisplayPart[] | undefined): string {
  if (!parts) return '';
  return parts.map((part) => part.text).join('');
}

/**
 * Extract documentation from JSDoc tags and documentation.
 */
function extractDocumentation(quickInfo: ts.QuickInfo): string {
  const parts: string[] = [];

  // Main documentation
  if (quickInfo.documentation && quickInfo.documentation.length > 0) {
    parts.push(displayPartsToString(quickInfo.documentation));
  }

  // JSDoc tags
  if (quickInfo.tags && quickInfo.tags.length > 0) {
    for (const tag of quickInfo.tags) {
      const tagName = tag.name;
      const tagText = displayPartsToString(tag.text);
      if (tagText) {
        parts.push(`@${tagName} ${tagText}`);
      } else {
        parts.push(`@${tagName}`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Extract modifiers from the display parts.
 */
function extractModifiersFromDisplayParts(quickInfo: ts.QuickInfo): string[] {
  const modifiers: string[] = [];

  if (!quickInfo.displayParts) return modifiers;

  // Common modifier keywords to look for
  const modifierKeywords = new Set([
    'export',
    'default',
    'async',
    'const',
    'let',
    'var',
    'readonly',
    'static',
    'private',
    'protected',
    'public',
    'abstract',
    'declare',
    'override',
  ]);

  // Look through display parts for keyword modifiers
  for (const part of quickInfo.displayParts) {
    if (part.kind === 'keyword' && modifierKeywords.has(part.text)) {
      modifiers.push(part.text);
    }
  }

  return [...new Set(modifiers)]; // Remove duplicates
}

/**
 * Extract modifiers from the AST node at a given position.
 */
function extractModifiersFromAST(
  service: ts.LanguageService,
  filePath: string,
  position: number
): string[] {
  const modifiers: string[] = [];
  const program = service.getProgram();
  if (!program) return modifiers;

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return modifiers;

  // Find the node at the position
  function findNode(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      const child = ts.forEachChild(node, findNode);
      if (child) return child;
      return node;
    }
    return undefined;
  }

  const targetNode = findNode(sourceFile);
  if (!targetNode) return modifiers;

  // Walk up to find the declaration node
  let declarationNode: ts.Node | undefined = targetNode;
  while (declarationNode && !ts.isVariableStatement(declarationNode) &&
         !ts.isFunctionDeclaration(declarationNode) &&
         !ts.isClassDeclaration(declarationNode) &&
         !ts.isMethodDeclaration(declarationNode) &&
         !ts.isPropertyDeclaration(declarationNode) &&
         !ts.isInterfaceDeclaration(declarationNode) &&
         !ts.isTypeAliasDeclaration(declarationNode) &&
         !ts.isEnumDeclaration(declarationNode) &&
         !ts.isModuleDeclaration(declarationNode)) {
    declarationNode = declarationNode.parent;
  }

  if (!declarationNode) return modifiers;

  // Check for export modifier on variable statements
  if (ts.isVariableStatement(declarationNode)) {
    const nodeModifiers = ts.getModifiers(declarationNode);
    if (nodeModifiers) {
      for (const mod of nodeModifiers) {
        if (mod.kind === ts.SyntaxKind.ExportKeyword) modifiers.push('export');
        if (mod.kind === ts.SyntaxKind.DeclareKeyword) modifiers.push('declare');
        if (mod.kind === ts.SyntaxKind.DefaultKeyword) modifiers.push('default');
      }
    }
    // Check variable declaration list for const/let/var
    const declList = declarationNode.declarationList;
    if (declList.flags & ts.NodeFlags.Const) modifiers.push('const');
    else if (declList.flags & ts.NodeFlags.Let) modifiers.push('let');
    else modifiers.push('var');
  }

  // Check for modifiers on functions, classes, methods, properties
  if (ts.isFunctionDeclaration(declarationNode) ||
      ts.isClassDeclaration(declarationNode) ||
      ts.isMethodDeclaration(declarationNode) ||
      ts.isPropertyDeclaration(declarationNode) ||
      ts.isInterfaceDeclaration(declarationNode) ||
      ts.isTypeAliasDeclaration(declarationNode) ||
      ts.isEnumDeclaration(declarationNode) ||
      ts.isModuleDeclaration(declarationNode)) {
    const nodeModifiers = ts.getModifiers(declarationNode);
    if (nodeModifiers) {
      for (const mod of nodeModifiers) {
        if (mod.kind === ts.SyntaxKind.ExportKeyword) modifiers.push('export');
        if (mod.kind === ts.SyntaxKind.DefaultKeyword) modifiers.push('default');
        if (mod.kind === ts.SyntaxKind.AsyncKeyword) modifiers.push('async');
        if (mod.kind === ts.SyntaxKind.DeclareKeyword) modifiers.push('declare');
        if (mod.kind === ts.SyntaxKind.AbstractKeyword) modifiers.push('abstract');
        if (mod.kind === ts.SyntaxKind.StaticKeyword) modifiers.push('static');
        if (mod.kind === ts.SyntaxKind.ReadonlyKeyword) modifiers.push('readonly');
        if (mod.kind === ts.SyntaxKind.PrivateKeyword) modifiers.push('private');
        if (mod.kind === ts.SyntaxKind.ProtectedKeyword) modifiers.push('protected');
        if (mod.kind === ts.SyntaxKind.PublicKeyword) modifiers.push('public');
        if (mod.kind === ts.SyntaxKind.OverrideKeyword) modifiers.push('override');
      }
    }
  }

  return [...new Set(modifiers)]; // Remove duplicates
}

/**
 * Extract the symbol name from quick info.
 */
function extractSymbolName(quickInfo: ts.QuickInfo): string {
  if (!quickInfo.displayParts) return 'unknown';

  // Look for the symbol name in display parts
  for (const part of quickInfo.displayParts) {
    if (
      part.kind === 'localName' ||
      part.kind === 'aliasName' ||
      part.kind === 'propertyName' ||
      part.kind === 'methodName' ||
      part.kind === 'functionName' ||
      part.kind === 'className' ||
      part.kind === 'interfaceName' ||
      part.kind === 'enumName' ||
      part.kind === 'enumMemberName' ||
      part.kind === 'parameterName' ||
      part.kind === 'typeParameterName'
    ) {
      return part.text;
    }
  }

  // Fallback: look for any identifier-like part
  for (const part of quickInfo.displayParts) {
    if (part.kind === 'text' && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part.text)) {
      return part.text;
    }
  }

  return 'unknown';
}

/**
 * Extract the type signature from quick info.
 */
function extractTypeSignature(quickInfo: ts.QuickInfo): string {
  if (!quickInfo.displayParts) return '';

  const fullText = displayPartsToString(quickInfo.displayParts);

  // Clean up the display text to extract just the type
  // Remove common prefixes like "const x: " or "function foo"
  const colonIndex = fullText.indexOf(':');
  if (colonIndex !== -1) {
    // Extract everything after the colon
    return fullText.slice(colonIndex + 1).trim();
  }

  // For functions, try to extract the signature
  const parenIndex = fullText.indexOf('(');
  if (parenIndex !== -1) {
    return fullText.slice(parenIndex).trim();
  }

  return fullText;
}

/**
 * Get the definition location for a symbol.
 */
async function getDefinitionLocation(
  service: ts.LanguageService,
  filePath: string,
  position: number
): Promise<DefinitionLocation | null> {
  const definitions = service.getDefinitionAtPosition(filePath, position);

  if (!definitions || definitions.length === 0) {
    return null;
  }

  // Use the first definition
  const def = definitions[0];
  if (!def) {
    return null;
  }

  const { line, column } = languageServiceManager.getLineAndColumn(
    service,
    def.fileName,
    def.textSpan.start
  );

  return {
    file: makeRelativePath(def.fileName, getProjectRoot()),
    line,
    column,
  };
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the get_symbol_info MCP tool call.
 *
 * Gets detailed information about a symbol at the specified position using
 * the TypeScript Language Service's getQuickInfoAtPosition API.
 *
 * @param args - The get_symbol_info tool arguments
 * @returns MCP tool response with symbol information
 *
 * @example
 * // Get info about a function
 * await handleGetSymbolInfo({
 *   file: 'src/utils.ts',
 *   line: 10,
 *   column: 17
 * });
 * // Returns: {
 * //   symbol: 'calculateTotal',
 * //   kind: 'function',
 * //   type: '(items: Item[]) => number',
 * //   documentation: 'Calculates the total price of all items.',
 * //   definition: { file: 'src/utils.ts', line: 10, column: 17 },
 * //   modifiers: ['export']
 * // }
 */
export async function handleGetSymbolInfo(
  args: GetSymbolInfoArgs
): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.file) {
    return createErrorResponse('Missing required argument: file');
  }

  if (typeof args.line !== 'number' || args.line < 1) {
    return createErrorResponse('Invalid argument: line must be a positive integer');
  }

  if (typeof args.column !== 'number' || args.column < 1) {
    return createErrorResponse('Invalid argument: column must be a positive integer');
  }

  // Resolve file path
  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(getProjectRoot(), args.file);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`);
  }

  try {
    // Get language service for the file
    const { service } = await languageServiceManager.getServiceForFile(filePath);

    // Convert line/column to offset
    const position = languageServiceManager.getPositionOffset(
      service,
      filePath,
      args.line,
      args.column
    );

    // Get quick info at position
    const quickInfo = service.getQuickInfoAtPosition(filePath, position);

    if (!quickInfo) {
      return createErrorResponse('No symbol information found at this position', {
        file: args.file,
        line: args.line,
        column: args.column,
      });
    }

    // Extract symbol information
    const symbol = extractSymbolName(quickInfo);
    const kind = mapScriptElementKind(quickInfo.kind);
    const type = extractTypeSignature(quickInfo);
    const documentation = extractDocumentation(quickInfo);
    // Use AST-based extraction for more complete modifiers, fall back to display parts
    const astModifiers = extractModifiersFromAST(service, filePath, position);
    const displayModifiers = extractModifiersFromDisplayParts(quickInfo);
    const modifiers = [...new Set([...astModifiers, ...displayModifiers])];

    // Get definition location
    const definition = await getDefinitionLocation(service, filePath, position);

    const result: SymbolInfoResult = {
      symbol,
      kind,
      type,
      documentation,
      definition,
      modifiers,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get symbol info: ${message}`, {
      file: args.file,
      line: args.line,
      column: args.column,
    });
  }
}
