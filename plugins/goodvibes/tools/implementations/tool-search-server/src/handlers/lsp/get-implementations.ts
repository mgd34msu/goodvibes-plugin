/**
 * Get Implementations Handler
 *
 * Finds all concrete implementations of an interface or abstract method.
 * Uses the TypeScript Language Service's getImplementationAtPosition method.
 *
 * Critical for polymorphic code - go_to_definition goes to the interface,
 * find_references finds usages - this tells you what code actually RUNS.
 *
 * @module handlers/lsp/get-implementations
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
  getPreviewFromSourceFile,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

export interface GetImplementationsArgs {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

interface Implementation {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Symbol kind (class, method, function, etc.) */
  kind: string;
  /** Symbol name */
  name: string;
  /** Preview of the implementation line */
  preview: string;
  /** Container name (class, module, etc.) */
  containerName?: string;
}

interface GetImplementationsResult {
  /** Symbol name at the queried position */
  symbol: string;
  /** Array of implementation locations */
  implementations: Implementation[];
  /** Number of implementations found */
  count: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map TypeScript ScriptElementKind to a more user-friendly kind string.
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
 * Extract the symbol name from an implementation span.
 */
function extractSymbolName(
  sourceFile: ts.SourceFile,
  textSpan: ts.TextSpan
): string {
  const text = sourceFile.text.slice(textSpan.start, textSpan.start + textSpan.length);
  return text.trim();
}

/**
 * Find the token at a given position in a source file.
 */
function findTokenAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      const child = ts.forEachChild(node, find);
      if (child) return child;
      return node;
    }
    return undefined;
  }
  return find(sourceFile);
}

/**
 * Get the symbol name at the cursor position using quick info.
 */
function getSymbolAtPosition(
  service: ts.LanguageService,
  filePath: string,
  position: number
): string {
  const quickInfo = service.getQuickInfoAtPosition(filePath, position);
  if (quickInfo?.displayParts) {
    for (const part of quickInfo.displayParts) {
      if (part.kind === 'localName' || part.kind === 'aliasName' || part.kind === 'interfaceName' || part.kind === 'className') {
        return part.text;
      }
    }
  }

  // Fallback: try to extract from the text at position
  const program = service.getProgram();
  if (program) {
    const sourceFile = program.getSourceFile(filePath);
    if (sourceFile) {
      const token = findTokenAtPosition(sourceFile, position);
      if (token && ts.isIdentifier(token)) {
        return token.text;
      }
    }
  }

  return 'unknown';
}

/**
 * Find the containing class or function name for a position.
 */
function findContainerName(
  sourceFile: ts.SourceFile,
  position: number
): string | undefined {
  function find(node: ts.Node): string | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      // Check if this node is a container (class, function, etc.)
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        return node.name?.text;
      }
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
        return node.name?.text;
      }
      if (ts.isModuleDeclaration(node)) {
        return ts.isIdentifier(node.name) ? node.name.text : undefined;
      }
      // Recurse into children
      let containerName: string | undefined;
      ts.forEachChild(node, (child) => {
        const result = find(child);
        if (result) containerName = result;
      });
      return containerName;
    }
    return undefined;
  }
  return find(sourceFile);
}

/**
 * Process an implementation location into our output format.
 */
function processImplementation(
  service: ts.LanguageService,
  impl: ts.ImplementationLocation
): Implementation | null {
  const program = service.getProgram();
  if (!program) return null;

  const sourceFile = program.getSourceFile(impl.fileName);
  if (!sourceFile) return null;

  const { line, column } = languageServiceManager.getLineAndColumn(
    service,
    impl.fileName,
    impl.textSpan.start
  );

  const name = extractSymbolName(sourceFile, impl.textSpan);
  const preview = getPreviewFromSourceFile(sourceFile, line);
  const containerName = findContainerName(sourceFile, impl.textSpan.start);

  return {
    file: makeRelativePath(impl.fileName, PROJECT_ROOT),
    line,
    column,
    kind: mapScriptElementKind(impl.kind),
    name: name || impl.displayParts?.map(p => p.text).join('') || 'unknown',
    preview,
    containerName,
  };
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the get_implementations MCP tool call.
 *
 * Finds all concrete implementations of an interface or abstract method
 * at the specified position. This is critical for understanding polymorphic
 * code - while go_to_definition takes you to the interface and find_references
 * shows usages, this tool tells you what code actually RUNS.
 *
 * @param args - The get_implementations tool arguments
 * @returns MCP tool response with implementation locations
 *
 * @example
 * // Find implementations of an interface
 * await handleGetImplementations({
 *   file: 'src/types.ts',
 *   line: 5,
 *   column: 18
 * });
 * // Returns: {
 * //   symbol: 'Repository',
 * //   implementations: [{
 * //     file: 'src/repositories/user-repository.ts',
 * //     line: 8,
 * //     column: 14,
 * //     kind: 'class',
 * //     name: 'UserRepository',
 * //     preview: 'export class UserRepository implements Repository<User> {'
 * //   }],
 * //   count: 1
 * // }
 */
export async function handleGetImplementations(
  args: GetImplementationsArgs
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
    : path.resolve(PROJECT_ROOT, args.file);

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

    // Get symbol name at position
    const symbol = getSymbolAtPosition(service, filePath, position);

    const implementations: Implementation[] = [];
    const seenLocations = new Set<string>();

    // Get implementations using TypeScript Language Service
    const implLocations = service.getImplementationAtPosition(filePath, position);

    if (implLocations) {
      for (const impl of implLocations) {
        const processed = processImplementation(service, impl);
        if (processed) {
          const locationKey = `${processed.file}:${processed.line}:${processed.column}`;
          if (!seenLocations.has(locationKey)) {
            seenLocations.add(locationKey);
            implementations.push(processed);
          }
        }
      }
    }

    const result: GetImplementationsResult = {
      symbol,
      implementations,
      count: implementations.length,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get implementations: ${message}`, {
      file: args.file,
      line: args.line,
      column: args.column,
    });
  }
}
