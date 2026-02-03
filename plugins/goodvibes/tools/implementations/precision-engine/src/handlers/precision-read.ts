/**
 * precision_read handler - Token-efficient file reading with extraction modes
 * SPEC-v2 Section 13.1.2
 *
 * Features:
 * - Extract modes: content, outline, symbols, ast, lines
 * - Batch file reading with per-file overrides
 * - Line range support
 * - Symbol filtering by kind
 * - Output modes for verbosity control
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';
import { startTimer } from '../logging.js';
import type { OutputMode, SymbolKind as GoodVibesSymbolKind } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { TreeSitterCore, OutlineNode as TSOutlineNode, SymbolInfo as TSSymbolInfo } from '../core/tree-sitter.js';
import { isLanguageSupported } from '../core/languages.js';

// === Interfaces per SPEC-v2 ===

type ExtractMode = 'content' | 'outline' | 'symbols' | 'ast' | 'lines';
type ReadOutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';
type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'property' | 'namespace';

interface FileReadSpec {
  path: string;
  extract?: ExtractMode;
  // SPEC-v2 uses 'range', but we support 'lines' for backward compatibility
  range?: { start: number; end: number };
  lines?: { start: number; end: number };  // @deprecated - use 'range' instead
}

interface ReadOutput {
  mode: ReadOutputMode;
  include_line_numbers?: boolean;
  include_metadata?: boolean;
  // Standardized name (preferred)
  max_per_item?: number;
  // Deprecated name (backward compatibility)
  max_lines_per_file?: number;
  max_tokens?: number;
}

interface PrecisionReadInput {
  files: (string | FileReadSpec)[];
  extract: ExtractMode;
  output: ReadOutput;
  symbol_filter?: SymbolKind[];
  default_range?: { start: number; end: number };
  output_mode?: OutputMode;
}

interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;
  exported?: boolean;
  container?: string;
}

interface OutlineItem {
  name: string;
  kind: string;
  line: number;
  endLine?: number;
  signature?: string;
  exported?: boolean;
  children?: OutlineItem[];
}

interface FileMetadata {
  size: number;
  modified: string;
  created?: string;
}

interface FileReadResult {
  path: string;
  exists: boolean;
  content?: string;
  lines?: string[];
  line_count?: number;
  symbols?: SymbolInfo[];
  outline?: OutlineItem[];
  ast?: unknown;
  metadata?: FileMetadata;
  error?: string;
  truncated?: boolean;
  encoding?: 'utf-8' | 'base64';
  is_binary?: boolean;
}

// === Constants ===

const MAX_BINARY_SIZE = 5 * 1024 * 1024; // 5MB

// Lazy tree-sitter instance
let treeSitterCore: TreeSitterCore | null = null;
function getTreeSitter(): TreeSitterCore {
  if (!treeSitterCore) treeSitterCore = new TreeSitterCore();
  return treeSitterCore;
}

// === Helper Functions ===

/**
 * Checks if a buffer contains binary data by looking for null bytes in the first 8KB
 */
function isBinaryFile(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes a path to handle both Unix-style Git Bash paths and Windows paths.
 * Converts /c/Users/... to C:/Users/...
 */
function normalizePath(inputPath: string): string {
  // Convert Unix-style Git Bash paths (/c/Users/...) to Windows paths (C:/Users/...)
  if (/^\/[a-z]\//i.test(inputPath)) {
    return inputPath[1].toUpperCase() + ':' + inputPath.slice(2);
  }
  return inputPath;
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

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
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

function extractSymbols(
  sourceFile: ts.SourceFile,
  symbolFilter?: SymbolKind[],
  includeSignatures: boolean = false
): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  function visit(node: ts.Node, container?: string) {
    const kind = tsKindToSymbolKind(node.kind);

    if (kind !== null) {
      const name = getNodeName(node);
      if (name) {
        if (!symbolFilter || symbolFilter.includes(kind)) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

          const symbol: SymbolInfo = {
            name,
            kind,
            line: line + 1,
            column: character + 1,
            exported: isExported(node),
          };

          if (container) {
            symbol.container = container;
          }

          if (includeSignatures) {
            symbol.signature = getSignature(node, sourceFile);
          }

          symbols.push(symbol);
        }

        // Use this symbol as container for children
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

function extractOutline(sourceFile: ts.SourceFile): OutlineItem[] {
  const outline: OutlineItem[] = [];

  function visit(node: ts.Node): OutlineItem | null {
    const kind = tsKindToSymbolKind(node.kind);
    if (!kind) return null;

    const name = getNodeName(node);
    if (!name) return null;

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const item: OutlineItem = {
      name,
      kind,
      line: line + 1,
    };

    // Get children for classes, interfaces, namespaces
    if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
      const children: OutlineItem[] = [];
      ts.forEachChild(node, child => {
        const childItem = visit(child);
        if (childItem) children.push(childItem);
      });
      if (children.length > 0) {
        item.children = children;
      }
    }

    return item;
  }

  ts.forEachChild(sourceFile, node => {
    const item = visit(node);
    if (item) outline.push(item);
  });

  return outline;
}

function extractAst(sourceFile: ts.SourceFile): unknown {
  // Return simplified AST structure
  function simplifyNode(node: ts.Node): unknown {
    const result: Record<string, unknown> = {
      kind: ts.SyntaxKind[node.kind],
    };

    const name = getNodeName(node);
    if (name) result.name = name;

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    result.line = line + 1;

    const children: unknown[] = [];
    ts.forEachChild(node, child => {
      // Only include significant nodes
      const childKind = tsKindToSymbolKind(child.kind);
      if (childKind || child.kind === ts.SyntaxKind.Block) {
        children.push(simplifyNode(child));
      }
    });

    if (children.length > 0) {
      result.children = children;
    }

    return result;
  }

  const children: unknown[] = [];
  ts.forEachChild(sourceFile, child => {
    const simplified = simplifyNode(child);
    children.push(simplified);
  });

  return {
    file: sourceFile.fileName,
    kind: 'SourceFile',
    children,
  };
}

async function readSingleFile(
  spec: FileReadSpec,
  globalExtract: ExtractMode,
  output: ReadOutput,
  symbolFilter?: SymbolKind[],
  defaultRange?: { start: number; end: number },
  workDir: string = process.cwd()
): Promise<FileReadResult> {
  const normalizedPath = normalizePath(spec.path);
  const filePath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(workDir, normalizedPath);
  const relativePath = path.relative(workDir, filePath);
  const extract = spec.extract ?? globalExtract;
  // Support both new (max_per_item) and old (max_lines_per_file) parameter names
  const maxLinesPerFile = output.max_per_item ?? output.max_lines_per_file ?? Infinity;

  const result: FileReadResult = {
    path: relativePath,
    exists: false,
  };

  try {
    // Check if file exists and get metadata
    const stats = await fs.stat(filePath);
    result.exists = true;

    if (output.include_metadata) {
      result.metadata = {
        size: stats.size,
        modified: stats.mtime.toISOString(),
        created: stats.birthtime?.toISOString(),
      };
    }

    // Read file as buffer first to check if binary
    const buffer = await fs.readFile(filePath);
    const isBinary = isBinaryFile(buffer);

    // Handle binary files
    if (isBinary) {
      if (buffer.length > MAX_BINARY_SIZE) {
        result.error = `Binary file exceeds maximum size (${buffer.length} bytes > ${MAX_BINARY_SIZE} bytes)`;
        result.is_binary = true;
        if (output.include_metadata && result.metadata) {
          result.metadata.size = buffer.length;
        }
        return result;
      }

      // Return base64 encoded content for binary files
      result.is_binary = true;
      result.encoding = 'base64';
      result.content = buffer.toString('base64');
      return result;
    }

    // Handle text files - convert buffer to UTF-8 string
    const content = buffer.toString('utf-8');
    result.encoding = 'utf-8';
    const allLines = content.split('\n');
    result.line_count = allLines.length;

    // Determine line range (SPEC-v2 uses 'range', fallback to 'lines' for backward compatibility)
    const lineRange = spec.range ?? spec.lines ?? defaultRange;
    let lines = allLines;
    let truncated = false;

    if (lineRange) {
      const start = Math.max(0, lineRange.start - 1);
      const end = Math.min(allLines.length, lineRange.end);
      lines = allLines.slice(start, end);
    }

    if (lines.length > maxLinesPerFile) {
      lines = lines.slice(0, maxLinesPerFile);
      truncated = true;
    }

    result.truncated = truncated;

    // Handle extraction mode
    switch (extract) {
      case 'content':
        if (output.include_line_numbers !== false) {
          const startLine = lineRange?.start ?? 1;
          result.content = lines
            .map((line, i) => `${String(startLine + i).padStart(5)} | ${line}`)
            .join('\n');
        } else {
          result.content = lines.join('\n');
        }
        break;

      case 'lines':
        result.lines = lines;
        break;

      case 'outline':
        if (isLanguageSupported(filePath)) {
          try {
            const treeSitter = getTreeSitter();
            const tree = treeSitter.parse(content, filePath);
            const tsOutline = treeSitter.getOutline(tree, filePath);
            // Map tree-sitter OutlineNode to OutlineItem
            const mapNode = (node: TSOutlineNode): OutlineItem => ({
              name: node.name,
              kind: node.kind,
              line: node.start.line,
              endLine: node.end.line,
              signature: node.signature,
              exported: node.exported,
              children: node.children?.map(mapNode),
            });
            result.outline = tsOutline.map(mapNode);
          } catch (error) {
            // Fallback to TypeScript compiler API for TS/JS files
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
              const sourceFile = ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true,
                filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
              );
              result.outline = extractOutline(sourceFile);
            } else {
              result.error = `Outline extraction failed: ${(error as Error).message}`;
            }
          }
        } else {
          result.error = 'Outline extraction not supported for this file type';
        }
        break;

      case 'symbols':
        if (isLanguageSupported(filePath)) {
          try {
            const treeSitter = getTreeSitter();
            const tree = treeSitter.parse(content, filePath);
            const tsSymbols = treeSitter.getSymbols(tree, filePath, symbolFilter);
            // Map tree-sitter SymbolInfo to local SymbolInfo
            result.symbols = tsSymbols.map((sym: TSSymbolInfo) => ({
              name: sym.name,
              kind: sym.kind,
              line: sym.start.line,
              column: sym.start.column,
              endLine: sym.end.line,
              endColumn: sym.end.column,
              signature: output.mode === 'verbose' ? sym.signature : undefined,
              exported: sym.exported,
              container: sym.container,
            }));
          } catch (error) {
            // Fallback to TypeScript compiler API for TS/JS files
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
              const sourceFile = ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true,
                filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
              );
              const includeSignatures = output.mode === 'verbose';
              result.symbols = extractSymbols(sourceFile, symbolFilter, includeSignatures);
            } else {
              result.error = `Symbol extraction failed: ${(error as Error).message}`;
            }
          }
        } else {
          result.error = 'Symbol extraction not supported for this file type';
        }
        break;

      case 'ast':
        if (isLanguageSupported(filePath)) {
          try {
            const treeSitter = getTreeSitter();
            const tree = treeSitter.parse(content, filePath);
            result.ast = tree.rootNode;
          } catch (error) {
            // Fallback to TypeScript compiler API for TS/JS files
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
              const sourceFile = ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true,
                filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
              );
              result.ast = extractAst(sourceFile);
            } else {
              result.error = `AST extraction failed: ${(error as Error).message}`;
            }
          }
        } else {
          result.error = 'AST extraction not supported for this file type';
        }
        break;
    }
  } catch (error) {
    result.error = (error as Error).message;
  }

  return result;
}

// === Main Handler ===

export const handlePrecisionRead: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionReadInput;
  const outputMode = parseOutputMode(args, "precision_read");
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.files || !Array.isArray(input.files) || input.files.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('precision_read', 'files', 'array of file paths or file specs'), { output_mode: outputMode, execution_ms: getElapsed() }));
    }

    // Apply defaults per schema (handlers must apply defaults, not just define them in schema)
    const extract: ExtractMode = input.extract ?? 'content';
    const output: ReadOutput = {
      mode: input.output?.mode ?? 'standard',
      include_line_numbers: input.output?.include_line_numbers ?? true,
      include_metadata: input.output?.include_metadata ?? false,
      ...input.output
    };

    // Normalize file specs
    const fileSpecs: FileReadSpec[] = input.files.map(f =>
      typeof f === 'string' ? { path: f } : f
    );

    // Read all files in parallel
    const results = await Promise.all(
      fileSpecs.map(spec =>
        readSingleFile(spec, extract, output, input.symbol_filter, input.default_range, workDir)
      )
    );

    // Build summary
    const filesRead = results.filter(r => r.exists && !r.error).length;
    const filesNotFound = results.filter(r => !r.exists).length;
    const totalLines = results.reduce((sum, r) => sum + (r.line_count ?? 0), 0);
    const anyTruncated = results.some(r => r.truncated);

    // Build output based on mode
    let data: unknown;
    const summary = {
      files_read: filesRead,
      files_not_found: filesNotFound,
      total_lines: totalLines,
      truncated: anyTruncated,
      files_binary: results.filter(r => r.is_binary).length,
    };

    switch (output.mode) {
      case 'count_only':
        data = { summary };
        break;

      case 'minimal':
        data = {
          files: Object.fromEntries(
            results.map(r => [
              r.path,
              {
                exists: r.exists,
                line_count: r.line_count,
                error: r.error,
                is_binary: r.is_binary,
              },
            ])
          ),
          summary,
        };
        break;

      case 'verbose':
        data = {
          files: Object.fromEntries(results.map(r => [r.path, r])),
          summary,
          tokens_used: estimateTokens(JSON.stringify(results)),
        };
        break;

      default: // standard
        data = {
          files: Object.fromEntries(
            results.map(r => {
              const entry: Record<string, unknown> = { exists: r.exists };
              if (r.content !== undefined) entry.content = r.content;
              if (r.lines !== undefined) entry.lines = r.lines;
              if (r.line_count !== undefined) entry.line_count = r.line_count;
              if (r.symbols !== undefined) entry.symbols = r.symbols;
              if (r.outline !== undefined) entry.outline = r.outline;
              if (r.ast !== undefined) entry.ast = r.ast;
              if (r.error) entry.error = r.error;
              if (r.encoding !== undefined) entry.encoding = r.encoding;
              if (r.is_binary !== undefined) entry.is_binary = r.is_binary;
              return [r.path, entry];
            })
          ),
          summary,
          tokens_used: estimateTokens(JSON.stringify(results)),
        };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
