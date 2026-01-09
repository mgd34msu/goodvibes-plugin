/**
 * Go To Definition Handler
 *
 * Finds the definition location(s) of a symbol at a given position.
 * Uses the TypeScript Language Service to resolve definitions.
 *
 * @module handlers/lsp/go-to-definition
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { ToolResponse } from '../../types.js';
import { languageServiceManager } from './language-service.js';

// =============================================================================
// Types
// =============================================================================

export interface GoToDefinitionArgs {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Include type definitions in addition to value definitions */
  include_type_definitions?: boolean;
}

interface Definition {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Symbol kind (function, class, variable, etc.) */
  kind: string;
  /** Symbol name */
  name: string;
  /** Preview of the definition line */
  preview: string;
  /** Container name (class, module, etc.) */
  containerName?: string;
  /** Whether this is a type definition vs value definition */
  isTypeDefinition?: boolean;
}

interface GoToDefinitionResult {
  /** Symbol name at the queried position */
  symbol: string;
  /** Array of definition locations */
  definitions: Definition[];
  /** Number of definitions found */
  count: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map TypeScript ScriptElementKind to a more user-friendly kind string.
 */
function mapScriptElementKind(kind: ts.ScriptElementKind): string {
  // Use a simple object instead of Record to avoid exhaustiveness issues
  // with different TypeScript versions
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
 * Extract the symbol name from a definition span.
 */
function extractSymbolName(
  sourceFile: ts.SourceFile,
  textSpan: ts.TextSpan
): string {
  const text = sourceFile.text.slice(textSpan.start, textSpan.start + textSpan.length);
  return text.trim();
}

/**
 * Get the preview line containing the definition.
 */
function getPreviewLine(
  sourceFile: ts.SourceFile,
  line: number
): string {
  const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
  const lineEnd = line < sourceFile.getLineStarts().length
    ? sourceFile.getPositionOfLineAndCharacter(line, 0)
    : sourceFile.text.length;

  const preview = sourceFile.text.slice(lineStart, lineEnd).trim();

  // Truncate very long lines
  const maxLength = 120;
  if (preview.length > maxLength) {
    return preview.slice(0, maxLength) + '...';
  }

  return preview;
}

/**
 * Process a definition location into our output format.
 */
function processDefinition(
  service: ts.LanguageService,
  def: ts.DefinitionInfo,
  isTypeDefinition: boolean
): Definition | null {
  const program = service.getProgram();
  if (!program) return null;

  const sourceFile = program.getSourceFile(def.fileName);
  if (!sourceFile) return null;

  const { line, column } = languageServiceManager.getLineAndColumn(
    service,
    def.fileName,
    def.textSpan.start
  );

  const name = extractSymbolName(sourceFile, def.textSpan);
  const preview = getPreviewLine(sourceFile, line);

  // Make path relative to PROJECT_ROOT for cleaner output
  let relativePath = def.fileName;
  if (path.isAbsolute(def.fileName)) {
    relativePath = path.relative(PROJECT_ROOT, def.fileName);
  }

  return {
    file: relativePath.replace(/\\/g, '/'),
    line,
    column,
    kind: mapScriptElementKind(def.kind),
    name: name || def.name || 'unknown',
    preview,
    containerName: def.containerName,
    isTypeDefinition,
  };
}

/**
 * Find the token at a given position in a source file.
 * This is a helper since getTokenAtPosition may not be available in all TS versions.
 */
function findTokenAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      // Check children first for more specific matches
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
    // Find the symbol name from display parts
    for (const part of quickInfo.displayParts) {
      if (part.kind === 'localName' || part.kind === 'aliasName') {
        return part.text;
      }
    }
  }

  // Fallback: try to extract from the text at position
  const program = service.getProgram();
  if (program) {
    const sourceFile = program.getSourceFile(filePath);
    if (sourceFile) {
      // Find the token at position
      const token = findTokenAtPosition(sourceFile, position);
      if (token && ts.isIdentifier(token)) {
        return token.text;
      }
    }
  }

  return 'unknown';
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the go_to_definition MCP tool call.
 *
 * Finds the definition location(s) of a symbol at the specified position.
 * Can optionally include type definitions for symbols that have both
 * value and type definitions.
 *
 * @param args - The go_to_definition tool arguments
 * @returns MCP tool response with definition locations
 *
 * @example
 * // Find definition of a function call
 * await handleGoToDefinition({
 *   file: 'src/utils.ts',
 *   line: 10,
 *   column: 5
 * });
 * // Returns: {
 * //   symbol: 'calculateTotal',
 * //   definitions: [{
 * //     file: 'src/math.ts',
 * //     line: 15,
 * //     column: 17,
 * //     kind: 'function',
 * //     name: 'calculateTotal',
 * //     preview: 'export function calculateTotal(items: Item[]): number {'
 * //   }],
 * //   count: 1
 * // }
 */
export async function handleGoToDefinition(
  args: GoToDefinitionArgs
): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.file) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Missing required argument: file',
        }, null, 2),
      }],
      isError: true,
    };
  }

  if (typeof args.line !== 'number' || args.line < 1) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Invalid argument: line must be a positive integer',
        }, null, 2),
      }],
      isError: true,
    };
  }

  if (typeof args.column !== 'number' || args.column < 1) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Invalid argument: column must be a positive integer',
        }, null, 2),
      }],
      isError: true,
    };
  }

  // Resolve file path
  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(PROJECT_ROOT, args.file);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `File not found: ${args.file}`,
        }, null, 2),
      }],
      isError: true,
    };
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

    const definitions: Definition[] = [];
    const seenLocations = new Set<string>();

    // Get value definitions
    const valueDefs = service.getDefinitionAtPosition(filePath, position);
    if (valueDefs) {
      for (const def of valueDefs) {
        const processed = processDefinition(service, def, false);
        if (processed) {
          const locationKey = `${processed.file}:${processed.line}:${processed.column}`;
          if (!seenLocations.has(locationKey)) {
            seenLocations.add(locationKey);
            definitions.push(processed);
          }
        }
      }
    }

    // Optionally get type definitions as well
    if (args.include_type_definitions) {
      const typeDefs = service.getTypeDefinitionAtPosition(filePath, position);
      if (typeDefs) {
        for (const def of typeDefs) {
          const processed = processDefinition(service, def, true);
          if (processed) {
            const locationKey = `${processed.file}:${processed.line}:${processed.column}`;
            if (!seenLocations.has(locationKey)) {
              seenLocations.add(locationKey);
              definitions.push(processed);
            }
          }
        }
      }
    }

    const result: GoToDefinitionResult = {
      symbol,
      definitions,
      count: definitions.length,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Failed to get definition: ${message}`,
          file: args.file,
          line: args.line,
          column: args.column,
        }, null, 2),
      }],
      isError: true,
    };
  }
}
