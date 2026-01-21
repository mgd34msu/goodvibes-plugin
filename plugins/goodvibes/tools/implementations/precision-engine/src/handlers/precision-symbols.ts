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
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler } from '../utils/index.js';
import { DEFAULT_EXCLUDES } from '../config.js';

// === Interfaces per SPEC-v2 ===

type SearchMode = 'workspace' | 'document';
type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'property' | 'namespace';
type SymbolOutputMode = 'count_only' | 'names_only' | 'locations' | 'signatures' | 'full';
type GroupBy = 'file' | 'kind' | 'none';

interface SymbolOutput {
  mode: SymbolOutputMode;
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
  output: SymbolOutput;
  output_mode?: OutputMode;
}

interface SymbolResult {
  name: string;
  kind: SymbolKind;
  file?: string;
  line?: number;
  column?: number;
  signature?: string;
  exported?: boolean;
  container?: string;
  documentation?: string;
}

// === Helper Functions ===

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

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
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

        const exported = isExported(node);
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

  try {
    // Only process TypeScript/JavaScript files
    if (!/\.(ts|tsx|js|jsx)$/.test(absolutePath)) {
      return [];
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      absolutePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      /\.tsx$|\.jsx$/.test(absolutePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    return extractSymbols(sourceFile, relativePath, options);
  } catch {
    return [];
  }
}

// === Main Handler ===

export const handlePrecisionSymbols: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionSymbolsInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.mode) {
      return toCallToolResult(errorResult('mode is required (workspace or document)', outputMode, getElapsed()));
    }

    if (!input.output) {
      return toCallToolResult(errorResult('output configuration is required', outputMode, getElapsed()));
    }

    if (input.mode === 'document' && (!input.files || input.files.length === 0)) {
      return toCallToolResult(errorResult('files array is required for document mode', outputMode, getElapsed()));
    }

    const maxResults = input.output.max_results ?? 100;
    const maxTokens = input.output.max_tokens ?? Infinity;
    const groupBy = input.output.group_by ?? 'none';

    const includeSignatures = input.output.mode === 'signatures' || input.output.mode === 'full';
    const includeFull = input.output.mode === 'full';

    // Get files to process
    let files: string[];
    if (input.mode === 'document') {
      files = input.files!.map(f => path.isAbsolute(f) ? f : path.join(workDir, f));
    } else {
      // Workspace mode - find all TS/JS files
      files = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
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
    switch (input.output.mode) {
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
