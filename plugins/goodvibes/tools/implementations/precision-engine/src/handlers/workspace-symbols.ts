/**
 * workspace_symbols handler - Search for symbols across the workspace
 */

import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult, SymbolInfo, SymbolKind } from '../types.js';
import { successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { toCallToolResult, ToolHandler } from './index.js';
import { DEFAULT_EXCLUDES } from '../config.js';

interface WorkspaceSymbolsInput {
  query: string;
  kinds?: SymbolKind[];
  limit?: number;
  output_mode?: OutputMode;
}

const SYMBOL_PATTERNS: Record<SymbolKind, RegExp> = {
  function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
  class: /(?:export\s+)?class\s+(\w+)/g,
  interface: /(?:export\s+)?interface\s+(\w+)/g,
  type: /(?:export\s+)?type\s+(\w+)/g,
  variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
  enum: /(?:export\s+)?enum\s+(\w+)/g,
  method: /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g,
  property: /(\w+)\s*[?!]?\s*:/g,
  constructor: /constructor\s*\(/g,
  namespace: /(?:export\s+)?namespace\s+(\w+)/g,
};

function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

async function searchFileForSymbols(
  filePath: string,
  query: string,
  kinds: SymbolKind[],
  workDir: string
): Promise<SymbolInfo[]> {
  const symbols: SymbolInfo[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(workDir, filePath);

    for (const kind of kinds) {
      const pattern = SYMBOL_PATTERNS[kind];
      if (!pattern) continue;

      const regex = new RegExp(pattern.source, 'gm');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        if (!name || !matchesQuery(name, query)) continue;

        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        const lineStart = beforeMatch.lastIndexOf('\n') + 1;
        const column = match.index - lineStart + 1;
        const exported = match[0].includes('export');

        symbols.push({
          name,
          kind,
          file: relativePath,
          line: lineNumber,
          column,
          signature: lines[lineNumber - 1]?.trim(),
          exported,
        });
      }
    }
  } catch {
    // Skip unreadable files
  }

  return symbols;
}

export const handleWorkspaceSymbols: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as WorkspaceSymbolsInput;
  const outputMode = parseOutputMode(args);
  const workDir = process.cwd();

  try {
    if (!input.query) {
      return toCallToolResult(errorResult('query is required', outputMode, getElapsed()));
    }

    const kinds: SymbolKind[] = input.kinds ?? ['function', 'class', 'interface', 'type', 'variable', 'enum'];
    const limit = input.limit ?? 50;

    const files = await fg(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      ignore: DEFAULT_EXCLUDES,
      absolute: true,
      onlyFiles: true,
    });

    const allSymbols: SymbolInfo[] = [];

    for (const file of files) {
      if (allSymbols.length >= limit * 2) break; // Early exit with buffer
      const symbols = await searchFileForSymbols(file, input.query, kinds, workDir);
      allSymbols.push(...symbols);
    }

    // Sort by relevance (exact matches first)
    allSymbols.sort((a, b) => {
      const aExact = a.name.toLowerCase() === input.query.toLowerCase();
      const bExact = b.name.toLowerCase() === input.query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });

    const limited = allSymbols.slice(0, limit);

    // Count by kind
    const byKind: Record<string, number> = {};
    for (const sym of limited) {
      byKind[sym.kind] = (byKind[sym.kind] || 0) + 1;
    }

    let data: unknown;
    switch (outputMode) {
      case 'count_only':
        data = { total_symbols: limited.length, by_kind: byKind };
        break;
      case 'minimal':
        data = limited.map(s => s.name);
        break;
      case 'verbose':
        data = limited;
        break;
      default: // standard
        data = limited.map(s => ({ name: s.name, kind: s.kind, file: s.file, line: s.line }));
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
