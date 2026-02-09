/**
 * precision_symbols handler - Token-efficient symbol search
 * SPEC-v2 Section 13.1.4
 *
 * Features:
 * - Modes: workspace (search by query), document (analyze specific files)
 * - Kind filtering: function, method, class, interface, type, variable, constant, enum, property, namespace
 * - Output modes: count_only, names_only, locations, signatures, full
 * - Grouping by file, kind, or none
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler, parseJsonField } from '../utils/index.js';
import { formatMissingParamError, formatInvalidValueError, createErrorResult } from '../utils/errors.js';
import { DEFAULT_EXCLUDES } from '../config.js';
import { TreeSitterCore, SymbolInfo as TSSymbolInfo } from '../core/tree-sitter.js';
import { isLanguageSupported, getSupportedExtensions } from '../core/languages.js';

// === Singleton Parser ===
const treeSitterCore = new TreeSitterCore();

// === Interfaces per SPEC-v2 ===

type SearchMode = 'workspace' | 'document';
type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'property' | 'namespace';
type SymbolOutputMode = 'count_only' | 'names_only' | 'locations' | 'signatures' | 'full';
type GroupBy = 'file' | 'kind' | 'none';

interface SymbolOutput {
  mode?: SymbolOutputMode;
  format?: SymbolOutputMode;  // MCP schema-aligned alias
  max_results?: number;
  group_by?: GroupBy;
  max_tokens?: number;
}

interface PrecisionSymbolsInput {
  mode: SearchMode;
  query?: string;
  files?: string[];
  kinds?: SymbolKind[];
  exported_only?: boolean;
  include_private?: boolean;
  language?: 'auto' | 'typescript' | 'python' | 'rust' | 'go';
  output: SymbolOutput;
  output_mode?: OutputMode;
}

interface SymbolResult {
  name: string;
  kind: SymbolKind;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;
  exported?: boolean;
  container?: string;
  documentation?: string;
}

// === Helper Functions ===

/**
 * Get glob patterns for multi-language support
 */
function getGlobPatterns(language?: 'auto' | 'typescript' | 'python' | 'rust' | 'go'): string[] {
  if (!language || language === 'auto') {
    return ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.rs', '**/*.go'];
  }
  
  switch (language) {
    case 'typescript':
      return ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    case 'python':
      return ['**/*.py'];
    case 'rust':
      return ['**/*.rs'];
    case 'go':
      return ['**/*.go'];
    default:
      return ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
  }
}

function estimateTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

function tsKindToSymbolKind(kind: ts.SyntaxKind): SymbolKind | null {
  switch (kind) {
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction:
      return 'function';
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.MethodSignature:
      return 'method';
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.ClassExpression:
      return 'class';
    case ts.SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case ts.SyntaxKind.TypeAliasDeclaration:
      return 'type';
    case ts.SyntaxKind.VariableDeclaration:
      return 'variable';
    case ts.SyntaxKind.EnumDeclaration:
      return 'enum';
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.PropertySignature:
      return 'property';
    case ts.SyntaxKind.ModuleDeclaration:
      return 'namespace';
    default:
      return null;
  }
}

function getNodeName(node: ts.Node): string | null {
  if ('name' in node) {
    const nameNode = (node as { name?: ts.Node }).name;
    if (nameNode && ts.isIdentifier(nameNode)) {
      return nameNode.text;
    }
  }
  return null;
}

/**
 * Collects all exported symbol names from a source file.
 * Handles:
 * - Named exports: export { foo, bar }
 * - Aliased exports: export { foo as bar } (tracks local name "foo")
 * - Default exports: export default foo
 * - Direct exports: export function foo() {} (handled by isExported)
 *
 * Note: Does not support `export * from 'module'` (requires module resolution).
 *
 * @param sourceFile - TypeScript source file to analyze
 * @returns Set of local names that are exported
 */
function collectExportedNames(sourceFile: ts.SourceFile): Set<string> {
  const exportedNames = new Set<string>();

  ts.forEachChild(sourceFile, (node) => {
    // Handle: export { foo, bar } and export { foo as bar }
    if (ts.isExportDeclaration(node)) {
      const exportClause = node.exportClause;
      if (exportClause && ts.isNamedExports(exportClause)) {
        for (const element of exportClause.elements) {
          // propertyName is the local name (foo), name is the exported name (bar)
          // If no alias, propertyName is undefined and name is the local name
          const localName = element.propertyName?.text ?? element.name.text;
          exportedNames.add(localName);
        }
      }
    }

    // Handle: export default foo
    if (ts.isExportAssignment(node)) {
      if (ts.isIdentifier(node.expression)) {
        exportedNames.add(node.expression.text);
      }
    }
  });

  return exportedNames;
}

function isExported(node: ts.Node, exportedNames: Set<string>): boolean {
  // 1. Check direct export modifier (e.g., export function foo())
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
    return true;
  }

  // 2. Check if node name is in the exported names set (handles export { foo } and export default foo)
  const nodeName = getNodeName(node);
  if (!nodeName) return false;

  return exportedNames.has(nodeName);
}

function isPrivate(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ?? false;
}

function getSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  let text = sourceFile.text.slice(start, end);

  // Truncate at first { or ;
  const braceIndex = text.indexOf('{');
  const semiIndex = text.indexOf(';');

  if (braceIndex !== -1 && (semiIndex === -1 || braceIndex < semiIndex)) {
    text = text.slice(0, braceIndex).trim();
  } else if (semiIndex !== -1) {
    text = text.slice(0, semiIndex).trim();
  }

  // Limit length
  if (text.length > 200) {
    text = text.slice(0, 200) + '...';
  }

  return text;
}

function getJsDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return undefined;

  const firstDoc = jsDocs[0];
  if (ts.isJSDoc(firstDoc) && firstDoc.comment) {
    if (typeof firstDoc.comment === 'string') {
      return firstDoc.comment;
    }
    return firstDoc.comment.map(c => c.text).join(' ');
  }

  return undefined;
}

function extractSymbols(
  sourceFile: ts.SourceFile,
  filePath: string,
  options: {
    query?: string;
    kinds?: SymbolKind[];
    exportedOnly?: boolean;
    includePrivate?: boolean;
    includeSignatures?: boolean;
    includeFull?: boolean;
  }
): SymbolResult[] {
  const symbols: SymbolResult[] = [];
  const queryRegex = options.query ? new RegExp(options.query, 'i') : null;

  // Collect all exported names upfront
  const exportedNames = collectExportedNames(sourceFile);

  function visit(node: ts.Node, container?: string) {
    const kind = tsKindToSymbolKind(node.kind);

    if (kind !== null) {
      const name = getNodeName(node);
      if (name) {
        // Apply filters
        if (queryRegex && !queryRegex.test(name)) {
          // Check children anyway
          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            ts.forEachChild(node, child => visit(child, name));
          } else {
            ts.forEachChild(node, child => visit(child, container));
          }
          return;
        }

        if (options.kinds && !options.kinds.includes(kind)) {
          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            ts.forEachChild(node, child => visit(child, name));
          } else {
            ts.forEachChild(node, child => visit(child, container));
          }
          return;
        }

        const exported = isExported(node, exportedNames);
        if (options.exportedOnly && !exported) {
          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            ts.forEachChild(node, child => visit(child, name));
          } else {
            ts.forEachChild(node, child => visit(child, container));
          }
          return;
        }

        const priv = isPrivate(node);
        if (!options.includePrivate && priv) {
          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            ts.forEachChild(node, child => visit(child, name));
          } else {
            ts.forEachChild(node, child => visit(child, container));
          }
          return;
        }

        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        const symbol: SymbolResult = {
          name,
          kind,
          file: filePath,
          line: line + 1,
          column: character + 1,
        };

        if (options.includeSignatures || options.includeFull) {
          symbol.signature = getSignature(node, sourceFile);
        }

        if (options.includeFull) {
          symbol.exported = exported;
          if (container) {
            symbol.container = container;
          }
          const doc = getJsDocComment(node, sourceFile);
          if (doc) {
            symbol.documentation = doc;
          }
        }

        symbols.push(symbol);

        // Visit children with this symbol as container
        if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
          ts.forEachChild(node, child => visit(child, name));
          return;
        }
      }
    }

    ts.forEachChild(node, child => visit(child, container));
  }

  visit(sourceFile);
  return symbols;
}

async function processFile(
  filePath: string,
  workDir: string,
  options: {
    query?: string;
    kinds?: SymbolKind[];
    exportedOnly?: boolean;
    includePrivate?: boolean;
    includeSignatures?: boolean;
    includeFull?: boolean;
  }
): Promise<SymbolResult[]> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workDir, filePath);
  const relativePath = path.relative(workDir, absolutePath);

  // Read file content once for both tree-sitter and potential TS compiler fallback
  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch {
    return [];
  }

  try {
    // Check if language is supported by tree-sitter
    if (!isLanguageSupported(absolutePath)) {
      return [];
    }
    
    // Use tree-sitter for multi-language parsing
    const tree = await treeSitterCore.parse(content, absolutePath);
    const tsSymbols = treeSitterCore.getSymbols(tree, absolutePath, options.kinds);
    
    // Map tree-sitter symbols to SymbolResult format with end positions
    const symbols: SymbolResult[] = [];
    const queryRegex = options.query ? new RegExp(options.query, 'i') : null;
    
    for (const tsSymbol of tsSymbols) {
      // Apply filters
      if (queryRegex && !queryRegex.test(tsSymbol.name)) {
        continue;
      }
      
      if (options.exportedOnly && !tsSymbol.exported) {
        continue;
      }
      
      const symbol: SymbolResult = {
        name: tsSymbol.name,
        kind: tsSymbol.kind,
        file: relativePath,
        line: tsSymbol.start.line,
        column: tsSymbol.start.column,
        endLine: tsSymbol.end.line,
        endColumn: tsSymbol.end.column,
      };
      
      if (options.includeSignatures || options.includeFull) {
        symbol.signature = tsSymbol.signature;
      }
      
      if (options.includeFull) {
        symbol.exported = tsSymbol.exported;
        symbol.container = tsSymbol.container;
        
        // For 'full' mode, fall back to TypeScript API for JSDoc extraction
        if (/\.(ts|tsx|js|jsx)$/.test(absolutePath)) {
          const sourceFile = ts.createSourceFile(
            absolutePath,
            content,
            ts.ScriptTarget.Latest,
            true,
            /\.tsx$|\.jsx$/.test(absolutePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
          );
          
          // Find the node at this position for JSDoc
          const findNodeAtPosition = (node: ts.Node): ts.Node | null => {
            const nodeStart = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            if (nodeStart.line + 1 === symbol.line && nodeStart.character + 1 === symbol.column) {
              return node;
            }
            return ts.forEachChild(node, findNodeAtPosition) || null;
          };
          
          const node = findNodeAtPosition(sourceFile);
          if (node) {
            const doc = getJsDocComment(node, sourceFile);
            if (doc) {
              symbol.documentation = doc;
            }
          }
        }
      }
      
      symbols.push(symbol);
    }
    
    return symbols;
  } catch (error) {
    // S1a fix: Tree-sitter failed, try TypeScript compiler as fallback for TS/JS files
    const errMsg = error instanceof Error ? error.message : String(error);
    if (/\.(ts|tsx|js|jsx)$/.test(absolutePath)) {
      try {
        const sourceFile = ts.createSourceFile(
          absolutePath,
          content,
          ts.ScriptTarget.Latest,
          true,
          /\.tsx$|\.jsx$/.test(absolutePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );
        
        return extractSymbols(sourceFile, relativePath, options);
      } catch (fallbackError) {
        const fbMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        // Both tree-sitter and TS compiler failed - log for debugging
        console.error(`[precision-symbols] Both parsers failed for ${absolutePath}: tree-sitter: ${errMsg}, ts-compiler: ${fbMsg}`);
        return [];
      }
    }
    
    // Non-TS/JS file or both parsers failed
    return [];
  }
}

// === Main Handler ===

export const handlePrecisionSymbols: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionSymbolsInput;
  const input = { ...rawInput, files: parseJsonField(rawInput.files), kinds: parseJsonField(rawInput.kinds) } as PrecisionSymbolsInput;
  const outputMode = parseOutputMode(args, "precision_symbols");
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.mode) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_symbols', 'mode', 'workspace or document'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    if (!input.output) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_symbols', 'output', 'output configuration object'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    if (input.mode === 'document' && (!input.files || input.files.length === 0)) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_symbols', 'files', 'array of file paths (required for document mode)'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    const maxResults = input.output.max_results ?? 100;
    const maxTokens = input.output.max_tokens ?? Infinity;
    const groupBy = input.output.group_by ?? 'none';

    // S1b fix: Support both 'mode' and 'format' for backwards compatibility
    const outputFormat = input.output.mode ?? input.output.format ?? 'locations';
    const includeSignatures = outputFormat === 'signatures' || outputFormat === 'full';
    const includeFull = outputFormat === 'full';

    // Get files to process
    let files: string[];
    if (input.mode === 'document') {
      files = input.files!.map(f => path.isAbsolute(f) ? f : path.join(workDir, f));
    } else {
      // Workspace mode - find files matching language patterns
      const patterns = getGlobPatterns(input.language);
      files = await fg(patterns, {
        cwd: workDir,
        ignore: DEFAULT_EXCLUDES,
        absolute: true,
      });
    }

    // Process all files
    const allSymbols: SymbolResult[] = [];
    const byKind: Record<string, number> = {};
    let filesSearched = 0;
    let totalTokens = 0;

    for (const file of files) {
      if (allSymbols.length >= maxResults || totalTokens >= maxTokens) break;

      const symbols = await processFile(file, workDir, {
        query: input.query,
        kinds: input.kinds,
        exportedOnly: input.exported_only,
        includePrivate: input.include_private ?? false,
        includeSignatures,
        includeFull,
      });

      filesSearched++;

      for (const symbol of symbols) {
        if (allSymbols.length >= maxResults || totalTokens >= maxTokens) break;

        allSymbols.push(symbol);
        byKind[symbol.kind] = (byKind[symbol.kind] ?? 0) + 1;
        totalTokens += estimateTokens(JSON.stringify(symbol));
      }
    }

    // Group results if requested
    let groupedResults: unknown;
    if (groupBy === 'file') {
      const byFile: Record<string, SymbolResult[]> = {};
      for (const symbol of allSymbols) {
        const file = symbol.file ?? 'unknown';
        if (!byFile[file]) byFile[file] = [];
        byFile[file].push(symbol);
      }
      groupedResults = byFile;
    } else if (groupBy === 'kind') {
      const byKindGroup: Record<string, SymbolResult[]> = {};
      for (const symbol of allSymbols) {
        if (!byKindGroup[symbol.kind]) byKindGroup[symbol.kind] = [];
        byKindGroup[symbol.kind].push(symbol);
      }
      groupedResults = byKindGroup;
    } else {
      groupedResults = allSymbols;
    }

    // Build summary
    const summary = {
      total_symbols: allSymbols.length,
      by_kind: byKind,
      files_searched: filesSearched,
    };

    // Build output based on mode
    let data: unknown;
    switch (outputFormat) {
      case 'count_only':
        data = {
          summary,
          tokens_used: estimateTokens(JSON.stringify(summary)),
        };
        break;

      case 'names_only':
        data = {
          symbols: allSymbols.map(s => ({ name: s.name, kind: s.kind })),
          summary,
          tokens_used: totalTokens,
        };
        break;

      case 'locations':
        data = {
          symbols: groupBy === 'none'
            ? allSymbols.map(s => ({ name: s.name, kind: s.kind, file: s.file, line: s.line, column: s.column }))
            : groupedResults,
          summary,
          tokens_used: totalTokens,
        };
        break;

      case 'signatures':
        data = {
          symbols: groupBy === 'none'
            ? allSymbols.map(s => ({ name: s.name, kind: s.kind, file: s.file, line: s.line, column: s.column, signature: s.signature }))
            : groupedResults,
          summary,
          tokens_used: totalTokens,
        };
        break;

      case 'full':
        data = {
          symbols: groupBy === 'none' ? allSymbols : groupedResults,
          summary,
          tokens_used: totalTokens,
        };
        break;

      default:
        data = {
          symbols: allSymbols,
          summary,
          tokens_used: totalTokens,
        };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
