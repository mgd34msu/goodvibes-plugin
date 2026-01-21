/**
 * get_document_symbols handler - Get structural outline of files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult, DocumentSymbol, SymbolKind } from '../types.js';
import { successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { toCallToolResult, ToolHandler } from '../utils/index.js';

interface DocumentSymbolsInput {
  files: string[];
  kind_filter?: SymbolKind[];
  output_mode?: OutputMode;
}

interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  signature: string;
  children: ParsedSymbol[];
}

const SYMBOL_PATTERNS: Array<{ kind: SymbolKind; pattern: RegExp; nameGroup: number }> = [
  // Top-level declarations allow optional leading whitespace
  { kind: 'function', pattern: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, nameGroup: 1 },
  { kind: 'class', pattern: /^\s*(?:export\s+)?class\s+(\w+)/gm, nameGroup: 1 },
  { kind: 'interface', pattern: /^\s*(?:export\s+)?interface\s+(\w+)/gm, nameGroup: 1 },
  { kind: 'type', pattern: /^\s*(?:export\s+)?type\s+(\w+)/gm, nameGroup: 1 },
  { kind: 'enum', pattern: /^\s*(?:export\s+)?enum\s+(\w+)/gm, nameGroup: 1 },
  { kind: 'variable', pattern: /^\s*(?:export\s+)?const\s+(\w+)/gm, nameGroup: 1 },
  // Method pattern: handles public/private/protected, static, async modifiers (requires leading whitespace)
  { kind: 'method', pattern: /^\s+(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm, nameGroup: 1 },
  // Property pattern: handles access modifiers and readonly (requires leading whitespace)
  { kind: 'property', pattern: /^\s+(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:readonly\s+)?(\w+)\s*[?!]?\s*:/gm, nameGroup: 1 },
];

function findBlockEnd(content: string, startIndex: number): number {
  let depth = 0;
  let inBlock = false;
  const lines = content.substring(startIndex).split('\n');
  let lineCount = content.substring(0, startIndex).split('\n').length;

  for (const line of lines) {
    for (const char of line) {
      if (char === '{') {
        depth++;
        inBlock = true;
      } else if (char === '}') {
        depth--;
        if (inBlock && depth === 0) return lineCount;
      }
    }
    lineCount++;
  }

  return lineCount;
}

async function parseFile(
  filePath: string,
  kindFilter: SymbolKind[] | undefined,
  workDir: string
): Promise<{ file: string; symbols: ParsedSymbol[]; error?: string }> {
  const relativePath = path.relative(workDir, filePath);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const symbols: ParsedSymbol[] = [];

    for (const { kind, pattern, nameGroup } of SYMBOL_PATTERNS) {
      if (kindFilter && !kindFilter.includes(kind)) continue;

      const regex = new RegExp(pattern.source, 'gm');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const name = match[nameGroup];
        if (!name || ['if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;

        const lineNumber = content.substring(0, match.index).split('\n').length;
        const endLine = findBlockEnd(content, match.index + match[0].length);

        symbols.push({
          name,
          kind,
          line: lineNumber,
          endLine,
          signature: lines[lineNumber - 1]?.trim() || '',
          children: [],
        });
      }
    }

    // Sort by line number
    symbols.sort((a, b) => a.line - b.line);

    // Build hierarchy - methods/properties inside classes
    const topLevel: ParsedSymbol[] = [];
    const stack: ParsedSymbol[] = [];

    for (const sym of symbols) {
      while (stack.length > 0 && stack[stack.length - 1].endLine < sym.line) {
        stack.pop();
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(sym);
      } else {
        topLevel.push(sym);
      }

      if (sym.kind === 'class' || sym.kind === 'interface' || sym.kind === 'enum') {
        stack.push(sym);
      }
    }

    return { file: relativePath, symbols: topLevel };
  } catch (error) {
    return { file: relativePath, symbols: [], error: (error as Error).message };
  }
}

function toDocumentSymbols(parsed: ParsedSymbol[]): DocumentSymbol[] {
  return parsed.map(p => ({
    name: p.name,
    kind: p.kind,
    line: p.line,
    column: 0, // Column tracking not implemented in regex parsing
    endLine: p.endLine,
    signature: p.signature,
    children: p.children.length > 0 ? toDocumentSymbols(p.children) : undefined,
  }));
}

export const handleGetDocumentSymbols: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as DocumentSymbolsInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();

  try {
    if (!input.files || !Array.isArray(input.files) || input.files.length === 0) {
      return toCallToolResult(errorResult('files array is required', outputMode, getElapsed()));
    }

    const results = await Promise.all(
      input.files.map(f => {
        const filePath = path.isAbsolute(f) ? f : path.join(workDir, f);
        return parseFile(filePath, input.kind_filter, workDir);
      })
    );

    const totalSymbols = results.reduce((sum, r) => {
      const count = (syms: ParsedSymbol[]): number =>
        syms.reduce((s, sym) => s + 1 + count(sym.children), 0);
      return sum + count(r.symbols);
    }, 0);

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { total_symbols: totalSymbols, files_processed: results.length };
        break;
      case 'minimal':
        data = results.map(r => ({
          file: r.file,
          symbols: r.symbols.map(s => s.name),
        }));
        break;
      default: // standard & verbose
        data = results.map(r => ({
          file: r.file,
          symbols: toDocumentSymbols(r.symbols),
          error: r.error,
        }));
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
