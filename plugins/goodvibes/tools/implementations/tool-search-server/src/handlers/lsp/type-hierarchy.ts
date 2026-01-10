/**
 * Type Hierarchy Handler
 *
 * Provides type hierarchy information for a symbol at a given position.
 * Returns both supertypes (extends/implements) and subtypes (what extends/implements this type).
 * Essential for understanding class relationships and impact analysis when modifying base classes.
 *
 * @module handlers/lsp/type-hierarchy
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
 * Arguments for the get_type_hierarchy tool.
 */
export interface GetTypeHierarchyArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Direction: supertypes, subtypes, or both */
  direction?: 'supertypes' | 'subtypes' | 'both';
  /** Maximum depth to traverse (default: 5) */
  depth?: number;
}

/**
 * A type hierarchy item representing a class, interface, or type.
 */
interface TypeHierarchyItem {
  /** Type name */
  name: string;
  /** Type kind (class, interface, type, enum) */
  kind: string;
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * A supertype entry with relationship info and recursive chain.
 */
interface SupertypeEntry {
  /** The supertype */
  type: TypeHierarchyItem;
  /** Relationship type (extends, implements) */
  relation: 'extends' | 'implements';
  /** Recursive supertypes of this type */
  supertypes: SupertypeEntry[];
}

/**
 * A subtype entry with relationship info and recursive chain.
 */
interface SubtypeEntry {
  /** The subtype */
  type: TypeHierarchyItem;
  /** Relationship type (extends, implements) */
  relation: 'extends' | 'implements';
  /** Recursive subtypes of this type */
  subtypes: SubtypeEntry[];
}

/**
 * Result of the get_type_hierarchy tool.
 */
interface GetTypeHierarchyResult {
  /** The type at the queried position */
  item: TypeHierarchyItem | null;
  /** Types that this type extends or implements (ancestors) */
  supertypes: SupertypeEntry[];
  /** Types that extend or implement this type (descendants) */
  subtypes: SubtypeEntry[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map TypeScript SyntaxKind to a user-friendly type kind string.
 */
function getTypeKind(node: ts.Node): string {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return 'class';
  }
  if (ts.isInterfaceDeclaration(node)) {
    return 'interface';
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return 'type';
  }
  if (ts.isEnumDeclaration(node)) {
    return 'enum';
  }
  return 'unknown';
}

/**
 * Get the name of a type node.
 */
function getTypeName(node: ts.Node): string {
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.getText() ?? 'anonymous';
  }
  return 'unknown';
}

/**
 * Create a TypeHierarchyItem from a node.
 */
function createHierarchyItem(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  service: ts.LanguageService
): TypeHierarchyItem {
  const { line, column } = languageServiceManager.getLineAndColumn(
    service,
    sourceFile.fileName,
    node.getStart()
  );

  return {
    name: getTypeName(node),
    kind: getTypeKind(node),
    file: makeRelativePath(sourceFile.fileName, PROJECT_ROOT),
    line,
    column,
  };
}

/**
 * Find the type declaration node at the given position.
 */
function findTypeDeclaration(
  sourceFile: ts.SourceFile,
  position: number
): ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | null {
  function visit(node: ts.Node): ts.Node | null {
    // Check if position is within this node
    if (position < node.getStart() || position > node.getEnd()) {
      return null;
    }

    // Check if this is a type declaration
    if (
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      // Check if we're on the name or within the declaration
      if (node.name) {
        const nameStart = node.name.getStart();
        const nameEnd = node.name.getEnd();
        if (position >= nameStart && position <= nameEnd) {
          return node;
        }
      }
      // Also check if we're anywhere within the declaration
      const nodeStart = node.getStart();
      const nodeEnd = node.getEnd();
      if (position >= nodeStart && position <= nodeEnd) {
        // Try to find a more specific node first
        const child = ts.forEachChild(node, visit);
        return child ?? node;
      }
    }

    // Recurse into children
    return ts.forEachChild(node, visit) ?? null;
  }

  const result = visit(sourceFile);
  if (
    result &&
    (ts.isClassDeclaration(result) ||
      ts.isInterfaceDeclaration(result) ||
      ts.isTypeAliasDeclaration(result) ||
      ts.isEnumDeclaration(result))
  ) {
    return result;
  }
  return null;
}

/**
 * Get the declaration node for a type from its symbol.
 */
function getDeclarationFromSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | null {
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) {
    return null;
  }

  for (const decl of declarations) {
    if (
      ts.isClassDeclaration(decl) ||
      ts.isInterfaceDeclaration(decl) ||
      ts.isTypeAliasDeclaration(decl) ||
      ts.isEnumDeclaration(decl)
    ) {
      return decl;
    }
  }
  return null;
}

/**
 * Get supertypes (what this type extends/implements).
 */
function getSupertypes(
  node: ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration,
  checker: ts.TypeChecker,
  service: ts.LanguageService,
  depth: number,
  visited: Set<string>
): SupertypeEntry[] {
  if (depth <= 0) {
    return [];
  }

  const supertypes: SupertypeEntry[] = [];

  // Handle class declarations
  if (ts.isClassDeclaration(node)) {
    // Get extends clause
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        const relation: 'extends' | 'implements' =
          clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';

        for (const typeNode of clause.types) {
          const type = checker.getTypeAtLocation(typeNode);
          const symbol = type.getSymbol();
          if (!symbol) continue;

          const symbolName = symbol.getName();
          if (visited.has(symbolName)) continue;
          visited.add(symbolName);

          const decl = getDeclarationFromSymbol(symbol, checker);
          if (decl) {
            const sourceFile = decl.getSourceFile();
            const item = createHierarchyItem(decl, sourceFile, service);

            // Recursively get supertypes
            const nestedSupertypes = getSupertypes(decl, checker, service, depth - 1, visited);

            supertypes.push({
              type: item,
              relation,
              supertypes: nestedSupertypes,
            });
          }
        }
      }
    }
  }

  // Handle interface declarations
  if (ts.isInterfaceDeclaration(node)) {
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        for (const typeNode of clause.types) {
          const type = checker.getTypeAtLocation(typeNode);
          const symbol = type.getSymbol();
          if (!symbol) continue;

          const symbolName = symbol.getName();
          if (visited.has(symbolName)) continue;
          visited.add(symbolName);

          const decl = getDeclarationFromSymbol(symbol, checker);
          if (decl) {
            const sourceFile = decl.getSourceFile();
            const item = createHierarchyItem(decl, sourceFile, service);

            // Recursively get supertypes
            const nestedSupertypes = getSupertypes(decl, checker, service, depth - 1, visited);

            supertypes.push({
              type: item,
              relation: 'extends',
              supertypes: nestedSupertypes,
            });
          }
        }
      }
    }
  }

  // Handle type aliases (check if they extend other types)
  if (ts.isTypeAliasDeclaration(node)) {
    const type = checker.getTypeAtLocation(node.type);
    const baseTypes = type.getBaseTypes?.() ?? [];

    for (const baseType of baseTypes) {
      const symbol = baseType.getSymbol();
      if (!symbol) continue;

      const symbolName = symbol.getName();
      if (visited.has(symbolName)) continue;
      visited.add(symbolName);

      const decl = getDeclarationFromSymbol(symbol, checker);
      if (decl) {
        const sourceFile = decl.getSourceFile();
        const item = createHierarchyItem(decl, sourceFile, service);

        const nestedSupertypes = getSupertypes(decl, checker, service, depth - 1, visited);

        supertypes.push({
          type: item,
          relation: 'extends',
          supertypes: nestedSupertypes,
        });
      }
    }
  }

  return supertypes;
}

/**
 * Get subtypes (what extends/implements this type).
 * This requires scanning project files for declarations that reference this type.
 */
function getSubtypes(
  targetNode: ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration,
  targetName: string,
  program: ts.Program,
  checker: ts.TypeChecker,
  service: ts.LanguageService,
  depth: number,
  visited: Set<string>
): SubtypeEntry[] {
  if (depth <= 0) {
    return [];
  }

  const subtypes: SubtypeEntry[] = [];
  const targetSymbol = targetNode.name ? checker.getSymbolAtLocation(targetNode.name) : null;
  if (!targetSymbol) {
    return subtypes;
  }

  // Get all source files in the program
  const sourceFiles = program.getSourceFiles();

  for (const sourceFile of sourceFiles) {
    // Skip declaration files and node_modules
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes('node_modules')) continue;

    // Visit all nodes in the file
    const visitNode = (node: ts.Node) => {
      // Check class declarations
      if (ts.isClassDeclaration(node) && node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          const relation: 'extends' | 'implements' =
            clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';

          for (const typeNode of clause.types) {
            const type = checker.getTypeAtLocation(typeNode);
            const symbol = type.getSymbol();
            if (!symbol) continue;

            // Check if this references our target
            if (symbol === targetSymbol || symbol.getName() === targetName) {
              const nodeName = node.name?.getText() ?? 'anonymous';
              if (visited.has(nodeName)) continue;
              visited.add(nodeName);

              const item = createHierarchyItem(node, sourceFile, service);

              // Recursively get subtypes of this class
              const nestedSubtypes = getSubtypes(
                node,
                nodeName,
                program,
                checker,
                service,
                depth - 1,
                visited
              );

              subtypes.push({
                type: item,
                relation,
                subtypes: nestedSubtypes,
              });
            }
          }
        }
      }

      // Check interface declarations
      if (ts.isInterfaceDeclaration(node) && node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          for (const typeNode of clause.types) {
            const type = checker.getTypeAtLocation(typeNode);
            const symbol = type.getSymbol();
            if (!symbol) continue;

            if (symbol === targetSymbol || symbol.getName() === targetName) {
              const nodeName = node.name.getText();
              if (visited.has(nodeName)) continue;
              visited.add(nodeName);

              const item = createHierarchyItem(node, sourceFile, service);

              const nestedSubtypes = getSubtypes(
                node,
                nodeName,
                program,
                checker,
                service,
                depth - 1,
                visited
              );

              subtypes.push({
                type: item,
                relation: 'extends',
                subtypes: nestedSubtypes,
              });
            }
          }
        }
      }

      ts.forEachChild(node, visitNode);
    };

    ts.forEachChild(sourceFile, visitNode);
  }

  // Sort subtypes by file, then line
  subtypes.sort((a, b) => {
    const fileCompare = a.type.file.localeCompare(b.type.file);
    if (fileCompare !== 0) return fileCompare;
    return a.type.line - b.type.line;
  });

  return subtypes;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the get_type_hierarchy MCP tool call.
 *
 * Gets the type hierarchy for a symbol at the given position using the TypeScript
 * Language Service. Returns supertypes (extends/implements) and subtypes (what
 * extends/implements this type).
 *
 * @param args - The get_type_hierarchy tool arguments
 * @returns MCP tool response with JSON-formatted type hierarchy
 *
 * @example
 * ```typescript
 * const result = await handleGetTypeHierarchy({
 *   file: 'src/models/User.ts',
 *   line: 5,
 *   column: 14,
 *   direction: 'both'
 * });
 * // Returns type hierarchy with supertypes and subtypes
 * ```
 */
export async function handleGetTypeHierarchy(
  args: GetTypeHierarchyArgs
): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.file) {
      return createErrorResponse('Missing required argument: file');
    }
    if (typeof args.line !== 'number' || args.line < 1) {
      return createErrorResponse('Invalid line number: must be a positive integer');
    }
    if (typeof args.column !== 'number' || args.column < 1) {
      return createErrorResponse('Invalid column number: must be a positive integer');
    }

    const direction = args.direction ?? 'both';
    if (!['supertypes', 'subtypes', 'both'].includes(direction)) {
      return createErrorResponse('Invalid direction: must be "supertypes", "subtypes", or "both"');
    }

    const maxDepth = args.depth ?? 5;
    if (maxDepth < 1 || maxDepth > 20) {
      return createErrorResponse('Invalid depth: must be between 1 and 20');
    }

    // Resolve file path relative to PROJECT_ROOT
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(PROJECT_ROOT, args.file);

    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`);
    }

    // Get language service for the file
    const { service, program } = await languageServiceManager.getServiceForFile(normalizedFilePath);

    // Get the source file
    const sourceFile = program.getSourceFile(normalizedFilePath);
    if (!sourceFile) {
      return createErrorResponse(`Could not load source file: ${args.file}`);
    }

    // Convert line/column to offset
    const position = languageServiceManager.getPositionOffset(
      service,
      normalizedFilePath,
      args.line,
      args.column
    );

    // Find the type declaration at position
    const typeDecl = findTypeDeclaration(sourceFile, position);

    if (!typeDecl) {
      const result: GetTypeHierarchyResult = {
        item: null,
        supertypes: [],
        subtypes: [],
      };
      return createSuccessResponse(result);
    }

    // Create the item for the queried type
    const item = createHierarchyItem(typeDecl, sourceFile, service);
    const checker = program.getTypeChecker();
    const typeName = getTypeName(typeDecl);

    // Get supertypes if requested
    let supertypes: SupertypeEntry[] = [];
    if (direction === 'supertypes' || direction === 'both') {
      const visitedSuper = new Set<string>();
      visitedSuper.add(typeName);
      supertypes = getSupertypes(typeDecl, checker, service, maxDepth, visitedSuper);
    }

    // Get subtypes if requested
    let subtypes: SubtypeEntry[] = [];
    if (direction === 'subtypes' || direction === 'both') {
      const visitedSub = new Set<string>();
      visitedSub.add(typeName);
      subtypes = getSubtypes(typeDecl, typeName, program, checker, service, maxDepth, visitedSub);
    }

    const result: GetTypeHierarchyResult = {
      item,
      supertypes,
      subtypes,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get type hierarchy: ${message}`);
  }
}
