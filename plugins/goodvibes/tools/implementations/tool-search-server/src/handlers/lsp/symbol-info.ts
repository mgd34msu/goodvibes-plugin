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

  /* v8 ignore next -- defensive: fallback for unknown ScriptElementKind values */
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
 * Find the node at a given position in the AST.
 */
function findNodeAtPosition(
  sourceFile: ts.SourceFile,
  position: number
): ts.Node | undefined {
  function findNode(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      const child = ts.forEachChild(node, findNode);
      if (child) return child;
      return node;
    }
    return undefined;
  }

  return findNode(sourceFile);
}

/**
 * Check if the position is on a getter/setter keyword and return the name position.
 * When the cursor is on the 'get' or 'set' keyword, TypeScript doesn't return
 * quickInfo, but we want to return info about the getter/setter property.
 */
function getAccessorNamePosition(
  service: ts.LanguageService,
  filePath: string,
  position: number
): number | null {
  const program = service.getProgram();
  if (!program) return null;

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return null;

  const targetNode = findNodeAtPosition(sourceFile, position);
  if (!targetNode) return null;

  // Walk up to find getter/setter declaration
  let current: ts.Node | undefined = targetNode;
  while (current) {
    if (ts.isGetAccessorDeclaration(current) || ts.isSetAccessorDeclaration(current)) {
      // Return the position of the name, which has quickInfo
      return current.name.getStart(sourceFile);
    }
    current = current.parent;
  }

  return null;
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

  const targetNode = findNodeAtPosition(sourceFile, position);
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
 * The symbol name should be the most specific identifier for the cursor position.
 * For example, for a method, we want the method name, not the class name.
 */
function extractSymbolName(quickInfo: ts.QuickInfo): string {
  if (!quickInfo.displayParts) return 'unknown';

  // Priority order for symbol name parts (most specific first)
  // These are ordered so that more specific names (like methodName) take priority
  // over container names (like className)
  const priorityKinds = [
    'methodName',
    'propertyName',
    'functionName',
    'localName',
    'parameterName',
    'aliasName',
    'enumMemberName',
    'typeParameterName',
    'className',
    'interfaceName',
    'enumName',
    'moduleName',
  ];

  // Find the highest priority symbol name
  let bestMatch: { kind: string; text: string; priority: number } | null = null;

  for (const part of quickInfo.displayParts) {
    const priority = priorityKinds.indexOf(part.kind);
    if (priority !== -1) {
      if (!bestMatch || priority < bestMatch.priority) {
        bestMatch = { kind: part.kind, text: part.text, priority };
      }
    }
  }

  if (bestMatch) {
    return bestMatch.text;
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

  // For functions/methods, extract from the opening parenthesis to include the full signature
  // e.g., "function add(a: number, b: number): number" -> "(a: number, b: number): number"
  // e.g., "(method) MyClass.myMethod(): void" -> "(): void"
  const parenIndex = fullText.indexOf('(');
  if (parenIndex !== -1) {
    // Check if this looks like a function/method signature by looking for "):"
    // which indicates a return type annotation
    const afterParen = fullText.slice(parenIndex);
    if (afterParen.includes('):') || afterParen.includes(') =>')) {
      return afterParen.trim();
    }
    // Also handle methods like "(): void" without explicit return type annotation
    if (/\([^)]*\)\s*:/.test(afterParen)) {
      return afterParen.trim();
    }
  }

  // For non-function types, find the last colon that's followed by a type
  // This handles "const x: number" -> "number"
  // But avoids incorrectly splitting "function add(a: number, b: number): number"
  const colonIndex = fullText.lastIndexOf(':');
  if (colonIndex !== -1) {
    // Make sure we're not in a parameter list by checking for opening paren after colon
    const afterColon = fullText.slice(colonIndex + 1).trim();
    // If there's an opening paren after the colon, it's likely a function type
    if (afterColon.startsWith('(')) {
      return afterColon;
    }
    return afterColon;
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
    let quickInfo = service.getQuickInfoAtPosition(filePath, position);
    let effectivePosition = position;

    // If no quickInfo, check if we're on a getter/setter keyword
    // and get the info from the accessor name instead
    if (!quickInfo) {
      const accessorNamePos = getAccessorNamePosition(service, filePath, position);
      if (accessorNamePos !== null) {
        quickInfo = service.getQuickInfoAtPosition(filePath, accessorNamePos);
        effectivePosition = accessorNamePos;
      }
    }

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
    const astModifiers = extractModifiersFromAST(service, filePath, effectivePosition);
    const displayModifiers = extractModifiersFromDisplayParts(quickInfo);
    const modifiers = [...new Set([...astModifiers, ...displayModifiers])];

    // Get definition location
    const definition = await getDefinitionLocation(service, filePath, effectivePosition);

    /* v8 ignore next 25 -- defensive: built-in keyword/global checks rarely triggered */
    // Check for built-in keywords and globals without definitions
    // These have quickInfo but no meaningful symbol definition:
    // - Symbols with unknown name and no definition
    // - Keywords (like 'const', 'function', etc.)
    // - Built-in globals (like 'undefined', 'NaN', 'Infinity') which are 'var' kind with no definition
    if (definition === null) {
      // No definition found - check if this is a built-in without a source location
      if (symbol === 'unknown') {
        return createErrorResponse('No symbol information found at this position', {
          file: args.file,
          line: args.line,
          column: args.column,
        });
      }
      if (kind === 'keyword') {
        return createErrorResponse('No symbol information found at this position', {
          file: args.file,
          line: args.line,
          column: args.column,
        });
      }
      // Built-in globals like 'undefined', 'NaN', 'Infinity' have var/variable kind
      // but no definition location since they're intrinsic
      const builtInGlobals = new Set(['undefined', 'NaN', 'Infinity', 'globalThis']);
      if (builtInGlobals.has(symbol)) {
        return createErrorResponse('No symbol information found at this position', {
          file: args.file,
          line: args.line,
          column: args.column,
        });
      }
    }

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
