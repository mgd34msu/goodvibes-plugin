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
import { successResult, errorResult, parseOutputMode, toCallToolResult, toMixedCallToolResult, ToolHandler } from '../utils/index.js';
import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { parseJsonField } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import Parser from 'web-tree-sitter';
import { TreeSitterCore, OutlineNode as TSOutlineNode, SymbolInfo as TSSymbolInfo } from '../core/tree-sitter.js';
import { isLanguageSupported } from '../core/languages.js';
import { validateFilePath } from '../utils/path-validation.js';
import { getFileSuggestions, type FileSuggestion } from '../utils/file-suggestions.js';
import { getSlowFsThreshold, getSlowFsPrefixes, getMaxFileBytes, getMaxTokenEstimate, getPageSizeLines } from '../runtime-config.js';
import { FileStateCache } from '../state/file-cache.js';
import { detectFileType } from '../utils/file-type-detection.js';
import { getContextForFile, type ContextMetadata } from '../utils/context-intelligence.js';

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
  pages?: string; // PDF page range (e.g., "1-5", "3", "10-20")
  force?: boolean; // Skip size gate and read entire file
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
  pages?: string;
  output_mode?: OutputMode;
  token_budget?: number;
  page?: number;
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
  filesystem?: 'slow' | 'fast' | 'network' | 'local';
  stat_ms?: number;
  is_network?: boolean;
  note?: string;
  [key: string]: unknown; // Allow dynamic properties for slow FS detection
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
  is_image?: boolean;
  mime_type?: string;
  image_base64?: string;
  /** Status indicator for file read operation ('empty' | 'normal' | 'unchanged') */
  status?: 'empty' | 'normal' | 'unchanged';
  /** File size in bytes */
  size_bytes?: number;
  /** Warning message for edge cases (e.g., empty files) */
  warning?: string;
  suggestions?: FileSuggestion[];
  hint?: string;
  token_cost?: number;
  context?: ContextMetadata;
  pagination?: {
    page: number;
    page_size?: number;
    total_lines?: number;
    total_pages: number;
    pending_files?: string[];
    token_budget?: number;
    tokens_used?: number;
    estimated_tokens?: number;
    hint?: string;
  };
  cache?: {
    status: 'unchanged' | 'modified';
    last_read?: string;
    read_count?: number;
    tokens_saved?: number;
    hash?: string;
    hint?: string;
    previous_lines?: number;
    changes?: string;
    diff?: string;
    modified_by?: string;
  };
  cache_version?: number;
  [key: string]: unknown; // Allow dynamic properties for future extensions
}

// === Constants ===

const MAX_BINARY_SIZE = 5 * 1024 * 1024; // 5MB

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
};
const SVG_EXTENSIONS = new Set(['.svg']);

function getImageMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS[ext]) return IMAGE_EXTENSIONS[ext];
  if (SVG_EXTENSIONS.has(ext)) return 'image/svg+xml';
  return null;
}

function isPdfFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function isNotebookFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.ipynb';
}

function parsePageRange(pages: string): { start: number; end: number } {
  const trimmed = pages.trim();
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map(s => s.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid page range: "${pages}". Use format like "1-5" or "3".`);
    }
    const [startStr, endStr] = parts;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      throw new Error(`Invalid page range: "${pages}". Use format like "1-5" or "3".`);
    }
    return { start, end };
  }
  const page = parseInt(trimmed, 10);
  if (isNaN(page) || page < 1) {
    throw new Error(`Invalid page number: "${pages}". Use format like "1-5" or "3".`);
  }
  return { start: page, end: page };
}

async function readPdfFile(
  buffer: Buffer,
  filePath: string,
  result: FileReadResult,
  pages?: string,
): Promise<FileReadResult> {
  try {
    const pdfParse = (await import('pdf-parse')).default;

    // Collect text per page using custom renderer
    const pageTexts: string[] = [];

    const options: Record<string, unknown> = {
      pagerender: async function(pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
        const textContent = await pageData.getTextContent();
        const text = textContent.items.map((item: { str: string }) => item.str).join(' ');
        pageTexts.push(text);
        return text;
      }
    };

    const pdfData = await pdfParse(buffer, options);
    const totalPages = pdfData.numpages;

    // If > 10 pages and no pages param, require page range
    if (totalPages > 10 && !pages) {
      result.error = `PDF has ${totalPages} pages. For PDFs with more than 10 pages, you MUST provide the pages parameter (e.g., pages: "1-5"). Maximum 20 pages per request.`;
      result.line_count = 0;
      return result;
    }

    let text: string;
    if (pages) {
      const range = parsePageRange(pages);
      const requestedPages = range.end - range.start + 1;
      if (requestedPages > 20) {
        result.error = `Requested ${requestedPages} pages but maximum is 20 per request. Use a smaller range.`;
        return result;
      }
      if (range.end > totalPages) {
        result.error = `Requested pages ${range.start}-${range.end} but PDF only has ${totalPages} pages.`;
        return result;
      }
      // Filter to requested page range (1-indexed)
      const selectedPages = pageTexts.slice(range.start - 1, range.end);
      text = selectedPages.map((pageText, i) => {
        const pageNum = range.start + i;
        return `--- Page ${pageNum} ---\n${pageText}`;
      }).join('\n\n');
    } else {
      // Return all pages (≤10 pages, no range specified)
      text = pageTexts.map((pageText, i) => {
        return `--- Page ${i + 1} ---\n${pageText}`;
      }).join('\n\n');
    }

    result.content = text;
    result.encoding = 'utf-8';
    result.line_count = text.split('\n').length;
    result.is_binary = false;
    return result;
  } catch (err) {
    result.error = `Failed to parse PDF: ${(err as Error).message}`;
    return result;
  }
}

function parseNotebook(content: string): string {
  try {
    const notebook = JSON.parse(content);
    const cells = notebook.cells;
    if (!Array.isArray(cells)) {
      return content; // Fallback to raw JSON
    }

    const parts: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellType = cell.cell_type || 'unknown';
      const source = Array.isArray(cell.source)
        ? cell.source.join('')
        : (cell.source || '');

      parts.push(`--- Cell ${i + 1} [${cellType}] ---`);
      parts.push(source);

      // Handle outputs for code cells
      if (cellType === 'code' && Array.isArray(cell.outputs)) {
        for (const output of cell.outputs) {
          if (output.output_type === 'stream') {
            const text = Array.isArray(output.text) ? output.text.join('') : (output.text || '');
            if (text) {
              parts.push(`[output: stream]`);
              parts.push(text);
            }
          } else if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
            const data = output.data || {};
            if (data['text/plain']) {
              const text = Array.isArray(data['text/plain'])
                ? data['text/plain'].join('')
                : data['text/plain'];
              parts.push(`[output: ${output.output_type}]`);
              parts.push(text);
            }
          } else if (output.output_type === 'error') {
            parts.push(`[output: error]`);
            parts.push(`${output.ename}: ${output.evalue}`);
            if (Array.isArray(output.traceback)) {
              parts.push(output.traceback.join('\n'));
            }
          }
        }
      }
      parts.push('');
    }

    return parts.join('\n');
  } catch {
    return content; // Malformed JSON, return raw
  }
}

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

/**
 * Format a timestamp as a human-readable relative time string
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
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

  // Validate path against sandbox boundary
  let validatedPath: string;
  try {
    validatedPath = await validateFilePath(filePath, workDir);
  } catch (e) {
    result.error = (e as Error).message;
    return result;
  }

  try {
    // Item 5: Slow filesystem detection
    const statStart = performance.now();
    const stats = await fs.stat(validatedPath);
    const statMs = performance.now() - statStart;
    result.exists = true;

    // Detect slow filesystem
    const slowThreshold = getSlowFsThreshold();
    const slowPrefixes = getSlowFsPrefixes();
    const isUNC = validatedPath.startsWith('\\\\') || (validatedPath.startsWith('//') && !validatedPath.startsWith('///'));
    const isKnownSlow = slowPrefixes.some(prefix => validatedPath.startsWith(prefix));
    const isSlow = statMs > slowThreshold || isUNC || isKnownSlow;

    if (output.include_metadata) {
      result.metadata = {
        size: stats.size,
        modified: stats.mtime.toISOString(),
        created: stats.birthtime?.toISOString(),
      };
      if (isSlow) {
        result.metadata.filesystem = 'slow';
        result.metadata.stat_ms = Math.round(statMs * 100) / 100;
        if (isUNC) {
          result.metadata.is_network = true;
        }
        result.metadata.note = `File is on a slow filesystem (${Math.round(statMs)}ms stat). Consider using range or extract modes to minimize I/O.`;
      }
    }

    // Item 4: Empty file detection
    if (stats.size === 0) {
      result.status = 'empty';
      result.size_bytes = 0;
      result.line_count = 1; // Empty file still counts as 1 line
      result.warning = 'File exists but is empty (0 bytes)';
      return result;
    }

    // Item 6B: Pre-read size gate — check file size before reading into memory
    const maxFileBytes = getMaxFileBytes();
    const maxTokenEstimate = getMaxTokenEstimate();
    const pageSizeLines = getPageSizeLines();
    const estimatedTokens = Math.ceil(stats.size / 4);

    // Size gate only fires for full-content reads, not targeted extractions
    const isContentRead = extract === 'content' || extract === 'lines';
    const exceedsBytes = stats.size > maxFileBytes;
    const exceedsTokens = estimatedTokens > maxTokenEstimate;

    if (isContentRead && (exceedsBytes || exceedsTokens) && !spec.force) {
      // Check if a range was already specified (user is paginating manually)
      const hasRange = (spec.range && (spec.range.start !== undefined || spec.range.end !== undefined)) ||
                       (spec.lines && (spec.lines.start !== undefined || spec.lines.end !== undefined)) ||
                       (defaultRange && (defaultRange.start !== undefined || defaultRange.end !== undefined));
      if (!hasRange) {
        // Return first page with pagination metadata - read only necessary bytes
        const estimatedBytesPerLine = 80; // Conservative estimate
        const bytesToRead = Math.min(pageSizeLines * estimatedBytesPerLine * 2, stats.size);
        
        const fd = await fs.open(validatedPath, 'r');
        const buf = Buffer.alloc(bytesToRead);
        await fd.read(buf, 0, bytesToRead, 0);
        await fd.close();
        
        const partialContent = buf.toString('utf-8');
        const allPartialLines = partialContent.split('\n');
        const firstPageLines = allPartialLines.slice(0, pageSizeLines);
        
        // Estimate total lines based on average bytes per line
        const avgBytesPerLine = bytesToRead / allPartialLines.length;
        const estimatedTotalLines = Math.ceil(stats.size / avgBytesPerLine);
        
        result.content = firstPageLines.join('\n');
        result.lines = firstPageLines;
        result.line_count = estimatedTotalLines;
        result.truncated = true;
        result.size_bytes = stats.size;
        result.pagination = {
          page: 1,
          page_size: pageSizeLines,
          total_lines: estimatedTotalLines,
          total_pages: Math.ceil(estimatedTotalLines / pageSizeLines),
          estimated_tokens: estimatedTokens,
          hint: `Large file (${stats.size} bytes, ~${estimatedTokens} tokens). Showing first ${pageSizeLines} lines. Use range: {start: ${pageSizeLines + 1}, end: ${pageSizeLines * 2}} for next page, or extract: "outline"/"symbols" for structure.`
        };
        return result;
      }
    }

    // Read file as buffer first to check if binary
    const buffer = await fs.readFile(validatedPath);
    const mimeType = getImageMimeType(validatedPath);
    const isBinary = isBinaryFile(buffer);

    // Handle binary files
    if (isBinary) {
      // Handle PDF files
      if (isPdfFile(validatedPath)) {
        return readPdfFile(buffer, validatedPath, result, spec.pages);
      }

      // Check binary file size
      if (buffer.length > MAX_BINARY_SIZE) {
        result.is_binary = true;
        if (mimeType) {
          result.is_image = true;
          result.mime_type = mimeType;
          result.error = `Image file exceeds maximum size (${buffer.length} bytes > ${MAX_BINARY_SIZE} bytes). No visual content returned.`;
        } else {
          result.error = `Binary file exceeds maximum size (${buffer.length} bytes > ${MAX_BINARY_SIZE} bytes)`;
        }
        if (output.include_metadata && result.metadata) {
          result.metadata.size = buffer.length;
        }
        return result;
      }

      // Handle image files (binary images like PNG, JPG)
      if (mimeType) {
        result.is_binary = true;
        result.is_image = true;
        result.mime_type = mimeType;
        result.encoding = 'base64';
        result.image_base64 = buffer.toString('base64');
        return result;
      }

      // Return base64 encoded content for other binary files
      result.is_binary = true;
      result.encoding = 'base64';
      result.content = buffer.toString('base64');
      return result;
    }

    // Handle text files - convert buffer to UTF-8 string
    const content = buffer.toString('utf-8');
    result.encoding = 'utf-8';

    // SVG is text-based but still an image
    if (mimeType === 'image/svg+xml') {
      result.is_image = true;
      result.mime_type = mimeType;
      result.encoding = 'utf-8';
      result.image_base64 = Buffer.from(content).toString('base64');
      result.content = content;
      result.line_count = content.split('\n').length;
      return result;
    }

    // Handle Jupyter notebooks
    if (isNotebookFile(validatedPath)) {
      const formatted = parseNotebook(content);
      result.content = formatted;
      result.encoding = 'utf-8';
      result.line_count = formatted.split('\n').length;
      return result;
    }

    const allLines = content.split('\n');
    result.line_count = allLines.length;

    // FileStateCache lookup — check if content is unchanged since last read
    const cache = FileStateCache.getInstance();
    const cacheLookup = cache.lookup(validatedPath, content, extract);

    if (cacheLookup.status === 'unchanged' && !spec.force) {
      // Return abbreviated response — file hasn't changed
      result.content = undefined; // Don't send full content
      result.status = 'unchanged';
      result.line_count = cacheLookup.entry.lineCount;
      result.size_bytes = cacheLookup.entry.byteSize;
      result.cache = {
        status: 'unchanged',
        last_read: formatTimeAgo(cacheLookup.entry.lastReadAt),
        read_count: cacheLookup.entry.readCount,
        tokens_saved: cacheLookup.tokensSaved,
        hash: cacheLookup.entry.contentHash.substring(0, 8),
        hint: 'Use force: true to get full content',
      };
      return result;
    }

    if (cacheLookup.status === 'modified' && !spec.force) {
      // File changed since last read — include diff info in metadata
      result.cache = {
        status: 'modified',
        previous_lines: cacheLookup.previousLineCount,
        changes: cacheLookup.changes,
        diff: cacheLookup.diff,
        modified_by: cacheLookup.modifiedBy,
        tokens_saved: cacheLookup.tokensSaved ?? 0,
        hint: 'Use force: true for full content without diff',
      };
      // Continue with normal content return (agent gets both content and diff)
    }

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
            const tree = await treeSitter.parse(content, filePath);
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
            const tree = await treeSitter.parse(content, filePath);
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
          result.error = 'Symbol extraction not supported for this file type. Supported languages include TypeScript, JavaScript, Python, Go, Rust, and more.';
        }
        break;

      case 'ast':
        if (isLanguageSupported(filePath)) {
          try {
            const treeSitter = getTreeSitter();
            const tree = await treeSitter.parse(content, filePath);
            // Convert tree-sitter AST to simplified format
            function simplifyNode(node: Parser.SyntaxNode, depth: number = 0): Record<string, unknown> {
              if (depth > 50) return { kind: node.type, line: node.startPosition.row + 1 };
              const simplified: Record<string, unknown> = {
                kind: node.type,
                line: node.startPosition.row + 1,
              };
              const nameNode = node.childForFieldName?.('name');
              if (nameNode) simplified.name = nameNode.text;
              const children = node.namedChildren
                .filter((child: Parser.SyntaxNode) => child.namedChildCount > 0 || ['function_declaration', 'class_declaration', 'variable_declaration', 'import_declaration', 'export_statement', 'interface_declaration', 'type_alias_declaration', 'enum_declaration', 'method_definition'].includes(child.type))
                .map((child: Parser.SyntaxNode) => simplifyNode(child, depth + 1));
              if (children.length > 0) simplified.children = children;
              return simplified;
            }
            const children = tree.rootNode.namedChildren.map((c: Parser.SyntaxNode) => simplifyNode(c, 0));
            result.ast = {
              file: filePath,
              kind: 'SourceFile',
              children,
            };
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
          result.error = 'AST extraction not supported for this file type. Supported languages include TypeScript, JavaScript, Python, Go, Rust, and more.';
        }
        break;
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      try {
        const suggestions = await getFileSuggestions(validatedPath);
        result.error = `File not found: ${filePath}`;
        if (suggestions.length > 0) {
          result.suggestions = suggestions;
          result.hint = `Did you mean: ${suggestions[0].path}?`;
        }
      } catch {
        result.error = `File not found: ${filePath}`;
      }
    } else {
      result.error = err.message;
    }
  }

  // Contextual Intelligence (Item 3): enrich with file type and memory context
  if (result.exists) {
    try {
      const fileType = detectFileType(validatedPath);
      const context = await getContextForFile(validatedPath, fileType, workDir);
      result.context = context;
    } catch {
      // Context enrichment is non-critical — don't fail the read
    }
  }

  return result;
}

// === Main Handler ===

export const handlePrecisionRead: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as PrecisionReadInput;
  const input = { ...rawInput, files: parseJsonField(rawInput.files) } as PrecisionReadInput;
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
      typeof f === 'string'
        ? { path: f, pages: input.pages }
        : { pages: input.pages, ...f }  // per-file pages overrides top-level
    );

    // Read all files in parallel
    const results = await Promise.all(
      fileSpecs.map(spec =>
        readSingleFile(spec, extract, output, input.symbol_filter, input.default_range, workDir)
      )
    );

    // Token-Budgeted Batch Pagination (Item 7)
    let paginatedResults = results;
    let paginationMeta: {
      page: number;
      total_pages: number;
      pending_files: string[];
      token_budget: number;
      tokens_used: number;
    } | undefined;
    let paginationWarning: string | undefined;

    // Check if page is set without token_budget
    if (input.page && input.page > 1 && (!input.token_budget || input.token_budget <= 0)) {
      paginationWarning = 'page parameter is ignored without token_budget';
    }

    if (input.token_budget && input.token_budget > 0) {
      const budget = input.token_budget;
      const requestedPage = input.page ?? 1;
      
      // Calculate token cost per result
      const costsPerFile: { index: number; cost: number }[] = results.map((r, i) => {
        // Strip image_base64 before cost calculation to avoid inflating token cost
        const { image_base64: _img, ...costTarget } = r;
        return {
          index: i,
          cost: estimateTokens(JSON.stringify(costTarget)),
        };
      });
      
      // Assign token_cost to each result
      costsPerFile.forEach(({ index, cost }) => {
        results[index].token_cost = cost;
      });

      // Pack files into pageGroups
      const pageGroups: number[][] = [];
      let currentPage: number[] = [];
      let currentPageCost = 0;

      for (const { index, cost } of costsPerFile) {
        if (currentPage.length > 0 && currentPageCost + cost > budget) {
          pageGroups.push(currentPage);
          currentPage = [index];
          currentPageCost = cost;
        } else {
          currentPage.push(index);
          currentPageCost += cost;
        }
      }
      if (currentPage.length > 0) {
        pageGroups.push(currentPage);
      }

      const totalPages = pageGroups.length;
      const pageIndex = Math.min(requestedPage, totalPages) - 1;
      const selectedPage = pageGroups[pageIndex] || pageGroups[0] || [];
      
      // Get results for selected page
      paginatedResults = selectedPage.map(i => results[i]);
      
      // Build pending files list (files NOT in the selected page)
      const selectedSet = new Set(selectedPage);
      const pendingFiles = results
        .map((r, i) => ({ path: r.path, index: i }))
        .filter(({ index }) => !selectedSet.has(index))
        .map(({ path: p }) => p);

      const tokensUsed = selectedPage.reduce((sum, i) => sum + (costsPerFile[i]?.cost ?? 0), 0);

      paginationMeta = {
        page: pageIndex + 1,
        total_pages: totalPages,
        pending_files: pendingFiles,
        token_budget: budget,
        tokens_used: tokensUsed,
      };
    }

    // Build summary
    const filesRead = paginatedResults.filter(r => r.exists && !r.error).length;
    const filesNotFound = paginatedResults.filter(r => !r.exists).length;
    const totalLines = paginatedResults.reduce((sum, r) => sum + (r.line_count ?? 0), 0);
    const anyTruncated = paginatedResults.some(r => r.truncated);

    // Build output based on mode
    let data: unknown;
    const summary: Record<string, unknown> = {
      files_read: filesRead,
      files_not_found: filesNotFound,
      total_lines: totalLines,
      truncated: anyTruncated,
      files_binary: paginatedResults.filter(r => r.is_binary).length,
      files_image: paginatedResults.filter(r => r.is_image).length,
    };
    
    if (paginationMeta) {
      summary.pagination = paginationMeta;
    }
    
    if (paginationWarning) {
      summary.warning = paginationWarning;
    }

    switch (output.mode) {
      case 'count_only':
        data = { summary };
        break;

      case 'minimal':
        data = {
          files: Object.fromEntries(
            paginatedResults.map(r => {
              const fileObj: Record<string, unknown> = {
                exists: r.exists,
                line_count: r.line_count,
                error: r.error,
                is_binary: r.is_binary,
              };
              
              // Include context if present (Item 3)
              if (r.context) {
                fileObj.context = r.context;
              }
              
              // Include error-companion fields (Item 2C)
              if (r.suggestions !== undefined) fileObj.suggestions = r.suggestions;
              if (r.hint) fileObj.hint = r.hint;
              
              // Include metadata if present (Item 5)
              if (r.metadata) fileObj.metadata = r.metadata;
              
              // Add cache version to response metadata for OCC tracking
              const filePath = path.isAbsolute(r.path) ? r.path : path.join(workDir, r.path);
              const cacheEntry = FileStateCache.getInstance().getEntryInfo(filePath);
              if (cacheEntry) {
                fileObj.cache_version = cacheEntry.version;
              }
              
              return [r.path, fileObj];
            })
          ),
          summary,
        };
        break;

      case 'verbose':
        data = {
          files: Object.fromEntries(paginatedResults.map(r => {
            const { image_base64, ...rest } = r;
            
            // Add cache version to response metadata for OCC tracking
            const filePath = path.isAbsolute(r.path) ? r.path : path.join(workDir, r.path);
            const cacheEntry = FileStateCache.getInstance().getEntryInfo(filePath);
            if (cacheEntry) {
              (rest as Record<string, unknown>).cache_version = cacheEntry.version;
            }
            
            return [r.path, rest];
          })),
          summary,
          tokens_used: estimateTokens(JSON.stringify(paginatedResults)),
        };
        break;

      default: // standard
        data = {
          files: Object.fromEntries(
            paginatedResults.map(r => {
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
              if (r.is_image) entry.is_image = r.is_image;
              if (r.mime_type) entry.mime_type = r.mime_type;
              if (r.status !== undefined) entry.status = r.status;
              if (r.size_bytes !== undefined) entry.size_bytes = r.size_bytes;
              if (r.warning) entry.warning = r.warning;
              if (r.suggestions !== undefined) entry.suggestions = r.suggestions;
              if (r.hint) entry.hint = r.hint;
              if (r.context) entry.context = r.context;
              if (r.pagination) entry.pagination = r.pagination;
              if (r.cache) entry.cache = r.cache;
              if (r.metadata) entry.metadata = r.metadata;
              
              // Add cache version to response metadata for OCC tracking
              const filePath = path.isAbsolute(r.path) ? r.path : path.join(workDir, r.path);
              const cacheEntry = FileStateCache.getInstance().getEntryInfo(filePath);
              if (cacheEntry) {
                entry.cache_version = cacheEntry.version;
              }
              
              // Don't include image_base64 in JSON - it's in the ImageContent block
              return [r.path, entry];
            })
          ),
          summary,
          tokens_used: estimateTokens(JSON.stringify(paginatedResults)),
        };
    }

    // Check if any results contain images
    const imageResults = paginatedResults.filter(r => r.is_image && r.image_base64);

    if (imageResults.length === 0) {
      return toCallToolResult(successResult(data, outputMode, getElapsed()));
    }

    // Build mixed response with ImageContent blocks
    const imageBlocks: ImageContent[] = imageResults.map(r => ({
      type: 'image' as const,
      data: r.image_base64!,
      mimeType: r.mime_type!,
    }));

    return toMixedCallToolResult(
      successResult(data, outputMode, getElapsed()),
      imageBlocks
    );
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
