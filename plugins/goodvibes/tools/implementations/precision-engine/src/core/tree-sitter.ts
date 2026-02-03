/**
 * Tree-sitter wrapper for precision-engine
 * Provides AST parsing, symbol extraction, and code navigation
 */

import Parser from 'tree-sitter';
import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';

// Language imports
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import Rust from 'tree-sitter-rust';
import Go from 'tree-sitter-go';

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  start: Position;
  end: Position;
  signature?: string;
  exported?: boolean;
  container?: string;
}

export interface OutlineNode {
  name: string;
  kind: SymbolKind;
  start: Position;
  end: Position;
  signature?: string;
  exported?: boolean;
  children?: OutlineNode[];
}

export interface ReferenceInfo {
  file: string;
  line: number;
  column: number;
  context?: string;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'property'
  | 'namespace';

/**
 * Language configuration mapping
 */
const LANGUAGE_MAP: Record<string, { grammar: unknown; ext: string[] }> = {
  javascript: { grammar: JavaScript, ext: ['.js', '.jsx', '.mjs', '.cjs'] },
  typescript: { grammar: TypeScript.typescript, ext: ['.ts', '.tsx', '.mts', '.cts'] },
  python: { grammar: Python, ext: ['.py', '.pyi'] },
  rust: { grammar: Rust, ext: ['.rs'] },
  go: { grammar: Go, ext: ['.go'] },
};

/**
 * Get language from file extension
 */
function getLanguageForFile(filePath: string): { name: string; grammar: unknown } | null {
  const ext = path.extname(filePath);
  for (const [name, config] of Object.entries(LANGUAGE_MAP)) {
    if (config.ext.includes(ext)) {
      return { name, grammar: config.grammar };
    }
  }
  return null;
}

/**
 * Convert tree-sitter position (0-indexed) to 1-indexed
 */
function toPosition(point: Parser.Point): Position {
  return {
    line: point.row + 1,
    column: point.column + 1,
  };
}

/**
 * Convert tree-sitter range to Range
 */
function toRange(node: Parser.SyntaxNode): Range {
  return {
    start: toPosition(node.startPosition),
    end: toPosition(node.endPosition),
  };
}

/**
 * Extract symbol name from node
 */
function extractSymbolName(node: Parser.SyntaxNode): string | null {
  // Look for name child
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    return nameNode.text;
  }

  // Fallback: find first identifier child
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && (child.type === 'identifier' || child.type === 'type_identifier')) {
      return child.text;
    }
  }

  return null;
}

/**
 * Check if node is exported (TypeScript/JavaScript)
 */
function isExported(node: Parser.SyntaxNode): boolean {
  // Check for export keyword in parent or node itself
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement' || current.type === 'export_declaration') {
      return true;
    }
    // Check first child for 'export' keyword
    const firstChild = current.child(0);
    if (firstChild && firstChild.type === 'export') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Map tree-sitter node type to SymbolKind
 */
function mapNodeTypeToKind(nodeType: string, language: string): SymbolKind | null {
  if (language === 'typescript' || language === 'javascript') {
    switch (nodeType) {
      case 'function_declaration':
      case 'function':
      case 'arrow_function':
      case 'function_expression':
        return 'function';
      case 'method_definition':
      case 'method_signature':
        return 'method';
      case 'class_declaration':
      case 'class':
        return 'class';
      case 'interface_declaration':
        return 'interface';
      case 'type_alias_declaration':
        return 'type';
      case 'variable_declarator':
      case 'lexical_declaration':
        return 'variable';
      case 'enum_declaration':
        return 'enum';
      case 'property_signature':
      case 'public_field_definition':
      case 'property_identifier':
        return 'property';
      case 'namespace_declaration':
      case 'module_declaration':
        return 'namespace';
      default:
        return null;
    }
  } else if (language === 'python') {
    switch (nodeType) {
      case 'function_definition':
        return 'function';
      case 'class_definition':
        return 'class';
      default:
        return null;
    }
  } else if (language === 'rust') {
    switch (nodeType) {
      case 'function_item':
        return 'function';
      case 'struct_item':
      case 'enum_item':
        return 'class';
      case 'impl_item':
        return 'class';
      case 'trait_item':
        return 'interface';
      case 'type_item':
        return 'type';
      case 'const_item':
      case 'static_item':
        return 'constant';
      default:
        return null;
    }
  } else if (language === 'go') {
    switch (nodeType) {
      case 'function_declaration':
      case 'method_declaration':
        return 'function';
      case 'type_declaration':
        return 'type';
      case 'const_declaration':
        return 'constant';
      case 'var_declaration':
        return 'variable';
      default:
        return null;
    }
  }

  return null;
}

/**
 * Extract signature text from node
 */
function extractSignature(node: Parser.SyntaxNode, maxLength = 200): string {
  let text = node.text;

  // Truncate at first { or newline for functions/methods
  const braceIndex = text.indexOf('{');
  if (braceIndex !== -1) {
    text = text.slice(0, braceIndex).trim();
  }

  // Limit length
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }

  return text;
}

/**
 * Core Tree-sitter wrapper class
 */
export class TreeSitterCore {
  private parser: Parser;
  private currentLanguage: string | null = null;
  private lastParsedLanguage: string | null = null;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Parse content and return AST
   */
  parse(content: string, filePath: string): Parser.Tree {
    const lang = getLanguageForFile(filePath);
    if (!lang) {
      throw new Error(`Unsupported file type: ${filePath}`);
    }

    // Only set language if it changed (optimization)
    if (this.currentLanguage !== lang.name) {
      this.parser.setLanguage(lang.grammar as any);
      this.currentLanguage = lang.name;
    this.lastParsedLanguage = lang.name;
    }

    const tree = this.parser.parse(content);
    return tree;
  }

  /**
   * Get hierarchical outline with start+end positions
   */
  getOutline(tree: Parser.Tree, filePath: string): OutlineNode[] {
    const langInfo = getLanguageForFile(filePath);
    const language = langInfo?.name ?? this.lastParsedLanguage ?? 'typescript';
    const outline: OutlineNode[] = [];
    const rootNode = tree.rootNode;

    const buildOutline = (node: Parser.SyntaxNode, parentContainer?: string): OutlineNode[] => {
      const nodes: OutlineNode[] = [];

      const kind = mapNodeTypeToKind(node.type, language);
      if (kind) {
        const name = extractSymbolName(node);
        if (name) {
          const outlineNode: OutlineNode = {
            name,
            kind,
            start: toPosition(node.startPosition),
            end: toPosition(node.endPosition),
            signature: extractSignature(node),
            exported: isExported(node),
          };

          // Recursively process children for containers
          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            const children: OutlineNode[] = [];
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child) {
                children.push(...buildOutline(child, name));
              }
            }
            if (children.length > 0) {
              outlineNode.children = children;
            }
          }

          nodes.push(outlineNode);
          return nodes;
        }
      }

      // Continue traversing children
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          nodes.push(...buildOutline(child, parentContainer));
        }
      }

      return nodes;
    };

    return buildOutline(rootNode);
  }

  /**
   * Get flat symbol list with start+end positions
   */
  getSymbols(tree: Parser.Tree, filePath: string, filter?: SymbolKind[]): SymbolInfo[] {
    const langInfo = getLanguageForFile(filePath);
    const language = langInfo?.name ?? this.lastParsedLanguage ?? 'typescript';
    const symbols: SymbolInfo[] = [];
    const rootNode = tree.rootNode;

    const extractSymbols = (node: Parser.SyntaxNode, container?: string): void => {
      const kind = mapNodeTypeToKind(node.type, language);

      if (kind && (!filter || filter.includes(kind))) {
        const name = extractSymbolName(node);
        if (name) {
          symbols.push({
            name,
            kind,
            start: toPosition(node.startPosition),
            end: toPosition(node.endPosition),
            signature: extractSignature(node),
            exported: isExported(node),
            container,
          });
        }
      }

      // Continue traversing
      const newContainer = kind && (kind === 'class' || kind === 'interface' || kind === 'namespace')
        ? extractSymbolName(node) || container
        : container;

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          extractSymbols(child, newContainer);
        }
      }
    };

    extractSymbols(rootNode);
    return symbols;
  }

  /**
   * Find all references to a symbol across files
   */
  async findReferences(
    basePath: string,
    symbol: string,
    definedIn?: string
  ): Promise<ReferenceInfo[]> {
    const references: ReferenceInfo[] = [];

    // Find all relevant files
    const files = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      cwd: basePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    // Search for symbol in each file
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const tree = this.parse(content, file);
        const rootNode = tree.rootNode;

        // Find all identifier nodes matching the symbol
        const findIdentifiers = (node: Parser.SyntaxNode): void => {
          if (node.type === 'identifier' && node.text === symbol) {
            const pos = toPosition(node.startPosition);

            // Get context (the line containing this reference)
            const lines = content.split('\n');
            const context = lines[pos.line - 1]?.trim();

            references.push({
              file: path.relative(basePath, file),
              line: pos.line,
              column: pos.column,
              context,
            });
          }

          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
              findIdentifiers(child);
            }
          }
        };

        findIdentifiers(rootNode);
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    return references;
  }

  /**
   * Find where a symbol is defined
   */
  async findDefinition(basePath: string, symbol: string): Promise<SymbolInfo | null> {
    // Find all relevant files
    const files = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      cwd: basePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    // Search for symbol definition in each file
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const tree = this.parse(content, file);
        const lang = getLanguageForFile(file);
        if (!lang) continue;

        const symbols = this.getSymbols(tree, file);

        // Find matching symbol
        const match = symbols.find(s => s.name === symbol);
        if (match) {
          return match;
        }
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    return null;
  }

  /**
   * Get the enclosing function for a line
   */
  getEnclosingFunction(tree: Parser.Tree, line: number): Range | null {
    const rootNode = tree.rootNode;

    // Convert 1-indexed line to 0-indexed
    const targetLine = line - 1;

    let enclosingFunc: Parser.SyntaxNode | null = null;

    const findEnclosing = (node: Parser.SyntaxNode): void => {
      // Check if line is within this node
      if (node.startPosition.row <= targetLine && node.endPosition.row >= targetLine) {
        // Check if this is a function-like node
        if (
          node.type === 'function_declaration' ||
          node.type === 'function_expression' ||
          node.type === 'arrow_function' ||
          node.type === 'method_definition'
        ) {
          enclosingFunc = node;
        }

        // Continue searching children for more specific match
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            findEnclosing(child);
          }
        }
      }
    };

    findEnclosing(rootNode);

    return enclosingFunc ? toRange(enclosingFunc) : null;
  }

  /**
   * Get the enclosing class for a line
   */
  getEnclosingClass(tree: Parser.Tree, line: number): Range | null {
    const rootNode = tree.rootNode;

    // Convert 1-indexed line to 0-indexed
    const targetLine = line - 1;

    let enclosingClass: Parser.SyntaxNode | null = null;

    const findEnclosing = (node: Parser.SyntaxNode): void => {
      // Check if line is within this node
      if (node.startPosition.row <= targetLine && node.endPosition.row >= targetLine) {
        // Check if this is a class-like node
        if (
          node.type === 'class_declaration' ||
          node.type === 'class' ||
          node.type === 'interface_declaration'
        ) {
          enclosingClass = node;
        }

        // Continue searching children for more specific match
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            findEnclosing(child);
          }
        }
      }
    };

    findEnclosing(rootNode);

    return enclosingClass ? toRange(enclosingClass) : null;
  }
}
