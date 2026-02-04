/**
 * Tree-sitter wrapper for precision-engine
 * Uses web-tree-sitter (WASM) for cross-platform compatibility
 */

import { Parser, Language } from 'web-tree-sitter';
import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';

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
 * Language extension mapping
 */
const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx', '.mts', '.cts'],
  python: ['.py', '.pyi'],
  rust: ['.rs'],
  go: ['.go'],
};

/**
 * Get language name from file extension
 */
function getLanguageNameForFile(filePath: string): string | null {
  const ext = path.extname(filePath);
  for (const [name, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) {
      return name;
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
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    return nameNode.text;
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type && (child.type === 'identifier' || child.type === 'type_identifier')) {
      return child.text;
    }
  }

  return null;
}

/**
 * Check if node is exported (TypeScript/JavaScript)
 */
function isExported(node: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement' || current.type === 'export_declaration') {
      return true;
    }
    const firstChild = current.child(0);
    if (firstChild && firstChild.type && firstChild.type === 'export') {
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
  const braceIndex = text.indexOf('{');
  if (braceIndex !== -1) {
    text = text.slice(0, braceIndex).trim();
  }
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }
  return text;
}

/**
 * Get base directory for WASM files
 * Works both in development (node_modules) and bundled (dist/wasm)
 */
function getWasmBasePath(): string {
  // Try dist/wasm first (bundled), then node_modules (dev)
  const possiblePaths = [
    path.join(__dirname, 'wasm'),
    path.join(__dirname, '../wasm'),
    path.join(__dirname, '../../dist/wasm'),
    path.join(process.cwd(), 'dist/wasm'),
    path.join(__dirname, '../../node_modules/tree-sitter-wasms/out'),
    path.join(process.cwd(), 'node_modules/tree-sitter-wasms/out'),
  ];
  
  // Return the first path that might work - actual check happens at load time
  return possiblePaths[0];
}

let wasmBasePath: string | null = null;

/**
 * Find and cache the WASM base path
 */
async function findWasmBasePath(): Promise<string> {
  if (wasmBasePath) return wasmBasePath;
  
  const possiblePaths = [
    path.join(__dirname, 'wasm'),
    path.join(__dirname, '../wasm'),
    path.join(__dirname, '../../dist/wasm'),
    path.join(process.cwd(), 'dist/wasm'),
    path.join(__dirname, '../../node_modules/tree-sitter-wasms/out'),
    path.join(process.cwd(), 'node_modules/tree-sitter-wasms/out'),
  ];
  
  for (const p of possiblePaths) {
    try {
      await fs.access(path.join(p, 'tree-sitter-typescript.wasm'));
      wasmBasePath = p;
      return p;
    } catch {
      // Try next path
    }
  }
  
  throw new Error('Could not find tree-sitter WASM files');
}

/**
 * Core Tree-sitter wrapper class (web-tree-sitter / WASM)
 */
export class TreeSitterCore {
  private parser: Parser | null = null;
  private languages: Map<string, Parser.Language> = new Map();
  private currentLanguage: string | null = null;
  private lastParsedLanguage: string | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the parser (must be called before use)
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await Parser.init();
      this.parser = new Parser();
      this.initialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Load a language from WASM
   */
  private async loadLanguage(langName: string): Promise<Parser.Language | null> {
    if (this.languages.has(langName)) {
      return this.languages.get(langName)!;
    }

    try {
      const basePath = await findWasmBasePath();
      const wasmPath = path.join(basePath, `tree-sitter-${langName}.wasm`);
      const lang = await Parser.Language.load(wasmPath);
      this.languages.set(langName, lang);
      return lang;
    } catch {
      return null;
    }
  }

  /**
   * Parse content and return AST
   */
  async parse(content: string, filePath: string): Promise<Parser.Tree> {
    await this.init();

    const langName = getLanguageNameForFile(filePath);
    if (!langName) {
      throw new Error(`Unsupported file type: ${filePath}`);
    }

    if (this.currentLanguage !== langName) {
      const lang = await this.loadLanguage(langName);
      if (!lang) {
        throw new Error(`Language not available: ${langName}. WASM file not found.`);
      }
      this.parser!.setLanguage(lang);
      this.currentLanguage = langName;
    }
    this.lastParsedLanguage = langName;

    return this.parser!.parse(content);
  }

  /**
   * Get hierarchical outline with start+end positions
   */
  getOutline(tree: Parser.Tree, filePath: string): OutlineNode[] {
    const language = getLanguageNameForFile(filePath) ?? this.lastParsedLanguage ?? 'typescript';
    const rootNode = tree.rootNode;

    const buildOutline = (node: Parser.SyntaxNode): OutlineNode[] => {
      if (!node || !node.type) return [];
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

          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            const children: OutlineNode[] = [];
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child) {
                children.push(...buildOutline(child));
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

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          nodes.push(...buildOutline(child));
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
    const language = getLanguageNameForFile(filePath) ?? this.lastParsedLanguage ?? 'typescript';
    const symbols: SymbolInfo[] = [];
    const rootNode = tree.rootNode;

    const extractSymbols = (node: Parser.SyntaxNode, container?: string): void => {
      if (!node || !node.type) return;
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
    options?: { definedIn?: string; maxFiles?: number; maxResults?: number }
  ): Promise<ReferenceInfo[]> {
    const { definedIn, maxFiles = 1000, maxResults = 100 } = options ?? {};
    const references: ReferenceInfo[] = [];

    const allFiles = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      cwd: basePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    const files = allFiles.slice(0, maxFiles);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const tree = await this.parse(content, file);
        const rootNode = tree.rootNode;

        let skipFile = false;
        if (definedIn) {
          const relativePath = path.relative(basePath, file);
          if (relativePath.replace(/\\/g, '/') === definedIn.replace(/\\/g, '/')) {
            skipFile = true;
          }
        }

        if (!skipFile) {
          const findIdentifiers = (node: Parser.SyntaxNode): void => {
            if (node.type === 'identifier' && node.text === symbol) {
              const pos = toPosition(node.startPosition);
              const lines = content.split('\n');
              references.push({
                file: path.relative(basePath, file),
                line: pos.line,
                column: pos.column,
                context: lines[pos.line - 1]?.trim(),
              });
            }

            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child) findIdentifiers(child);
            }
          };

          findIdentifiers(rootNode);
        }

        if (references.length >= maxResults) break;
      } catch {
        continue;
      }
    }

    return references;
  }

  /**
   * Find where a symbol is defined
   */
  async findDefinition(basePath: string, symbol: string, maxFiles = 1000): Promise<SymbolInfo | null> {
    const allFiles = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      cwd: basePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    const files = allFiles.slice(0, maxFiles);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const tree = await this.parse(content, file);
        const symbols = this.getSymbols(tree, file);
        const match = symbols.find(s => s.name === symbol);
        if (match) return match;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Get the enclosing function for a line
   */
  getEnclosingFunction(tree: Parser.Tree, line: number): Range | null {
    const targetLine = line - 1;
    let enclosingFunc: Parser.SyntaxNode | null = null;

    const findEnclosing = (node: Parser.SyntaxNode): void => {
      if (node.startPosition.row <= targetLine && node.endPosition.row >= targetLine) {
        if (
          node.type === 'function_declaration' ||
          node.type === 'function_expression' ||
          node.type === 'arrow_function' ||
          node.type === 'method_definition'
        ) {
          enclosingFunc = node;
        }

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) findEnclosing(child);
        }
      }
    };

    findEnclosing(tree.rootNode);
    return enclosingFunc ? toRange(enclosingFunc) : null;
  }

  /**
   * Get the enclosing class for a line
   */
  getEnclosingClass(tree: Parser.Tree, line: number): Range | null {
    const targetLine = line - 1;
    let enclosingClass: Parser.SyntaxNode | null = null;

    const findEnclosing = (node: Parser.SyntaxNode): void => {
      if (node.startPosition.row <= targetLine && node.endPosition.row >= targetLine) {
        if (
          node.type === 'class_declaration' ||
          node.type === 'class' ||
          node.type === 'interface_declaration'
        ) {
          enclosingClass = node;
        }

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) findEnclosing(child);
        }
      }
    };

    findEnclosing(tree.rootNode);
    return enclosingClass ? toRange(enclosingClass) : null;
  }
}
