/**
 * discover handler - Lightweight parallel query execution for finding files/symbols
 */

import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, resolveStringField } from '../utils/index.js';
import { TOOL_SPECIFIC_DEFAULTS } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { handlePrecisionGrep } from './precision-grep.js';
import { handlePrecisionGlob } from './precision-glob.js';
import { handlePrecisionSymbols } from './precision-symbols.js';
import * as path from 'path';
import * as fs from 'fs/promises';

type DiscoverOutputMode = 'count_only' | 'files_only' | 'locations';

interface QuerySpec {
  id: string;
  type: 'grep' | 'glob' | 'symbols';
  // For grep:
  pattern?: string;
  pattern_base64?: string;
  glob?: string;
  // For glob:
  patterns?: string[];
  patterns_base64?: string[];
  // For symbols:
  query?: string;
  kinds?: string[];
}

interface DiscoverInput {
  queries: QuerySpec[];
  output_mode?: DiscoverOutputMode;
  base_path?: string;
}

interface LocationInfo {
  file: string;
  line: number;
  column: number;
  match?: string;
}

interface QueryResult {
  type?: 'grep' | 'glob' | 'symbols';
  count: number;
  files?: string[];
  locations?: LocationInfo[];
  error?: string;
}

/**
 * Validates and resolves base_path to ensure it stays within project boundaries.
 * Prevents path traversal attacks and ensures the path is a valid directory.
 */
async function validateBasePath(basePath: string, projectRoot: string): Promise<string> {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(basePath) 
    ? basePath 
    : path.resolve(projectRoot, basePath);
  
  // Resolve symlinks to get real path
  let realPath: string;
  try {
    realPath = await fs.realpath(absolutePath);
  } catch (e) {
    throw new Error(`Invalid base_path: '${basePath}' does not exist or is not accessible.`);
  }
  
  // Normalize for consistent comparison
  const normalizedReal = path.normalize(realPath);
  const normalizedRoot = path.normalize(projectRoot);
  
  // Verify path is within allowed boundaries
  if (!normalizedReal.startsWith(normalizedRoot)) {
    throw new Error(`base_path '${basePath}' is outside project root. Path traversal is not allowed.`);
  }
  
  // Verify it's a directory
  const stats = await fs.stat(realPath);
  if (!stats.isDirectory()) {
    throw new Error(`base_path '${basePath}' is not a directory.`);
  }
  
  return realPath;
}

async function executeGrepQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode,
  searchRoot: string
): Promise<QueryResult> {
  // Resolve pattern (supports regular strings, base64, and file paths)
  let patternValue: string;
  try {
    patternValue = resolveStringField(query as unknown as Record<string, unknown>, 'pattern', {
      allowFile: true,
      basePath: process.cwd(),
      required: true,
      fieldName: 'pattern'
    });
  } catch (error) {
    return { type: 'grep', count: 0, error: (error as Error).message };
  }

  try {
    let mode: 'count_only' | 'files_only' | 'locations';
    if (outputMode === 'count_only') {
      mode = 'count_only';
    } else if (outputMode === 'locations') {
      mode = 'locations';
    } else {
      mode = 'files_only';
    }

    const result = await handlePrecisionGrep({
      queries: [{
        id: 'discover-grep',
        pattern: patternValue,
        glob: query.glob,
        path: searchRoot !== process.cwd() ? searchRoot : undefined,
      }],
      output: {
        mode,
        max_total_matches: 100,
      },
      parallel: false,
      output_mode: 'minimal',
    });

    const content = result.content?.[0];
    if (!content || content.type !== 'text') {
      return { type: 'grep', count: 0, files: [] };
    }

    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      return { type: 'grep', count: 0, error: parsed.error };
    }

    const data = parsed.data;
    const queryResult = data.queries?.['discover-grep'];

    // If no results, return empty based on mode
    if (!queryResult) {
      if (outputMode === 'locations') {
        return { type: 'grep', count: 0, locations: [] };
      } else if (outputMode === 'count_only') {
        return { type: 'grep', count: 0 };
      } else {
        return { type: 'grep', count: 0, files: [] };
      }
    }

    if (outputMode === 'count_only') {
      const count = queryResult.match_count || 0;
      return { type: 'grep', count };
    }

    if (outputMode === 'locations') {
      // Extract locations from grep results
      const locations: LocationInfo[] = [];
      const files = queryResult.files || [];

      for (const fileResult of files) {
        const filePath = fileResult.file;
        const matches = fileResult.matches || [];

        for (const match of matches) {
          locations.push({
            file: filePath,
            line: match.line,
            column: match.column || 1,
            match: match.content?.trim(),
          });
        }
      }

      return {
        type: 'grep',
        count: locations.length,
        locations,
      };
    }

    // files_only mode
    const files = (queryResult.files || []).map((f: any) =>
      typeof f === 'string' ? f : f.file
    );
    return { type: 'grep', count: files.length, files };
  } catch (e) {
    return { type: 'grep', count: 0, error: (e as Error).message };
  }
}

async function executeGlobQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode,
  searchRoot: string
): Promise<QueryResult> {
  // Decode patterns from base64 if provided
  const patterns = query.patterns_base64
    ? query.patterns_base64.map(p => Buffer.from(p, 'base64').toString('utf-8'))
    : query.patterns;

  if (!patterns || patterns.length === 0) {
    return { type: 'glob', count: 0, error: "Missing 'patterns' or 'patterns_base64' for glob query" };
  }

  try {
    let mode: 'count_only' | 'paths_only' | 'with_stats';
    if (outputMode === 'count_only') {
      mode = 'count_only';
    } else if (outputMode === 'locations') {
      mode = 'with_stats'; // Get stats for locations mode
    } else {
      mode = 'paths_only';
    }

    const result = await handlePrecisionGlob({
      patterns: patterns,
      cwd: searchRoot !== process.cwd() ? searchRoot : undefined,
      output: {
        mode,
        max_files: 100,
      },
      output_mode: 'minimal',
    });

    const content = result.content?.[0];
    if (!content || content.type !== 'text') {
      return { type: 'glob', count: 0, files: [] };
    }

    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      return { type: 'glob', count: 0, error: parsed.error };
    }

    const data = parsed.data;

    if (outputMode === 'count_only') {
      return { type: 'glob', count: data.total_files || 0 };
    }

    if (outputMode === 'locations') {
      // Convert glob results with stats to locations
      const locations: LocationInfo[] = [];
      const files = data.files || [];

      for (const fileInfo of files) {
        const filePath = typeof fileInfo === 'string' ? fileInfo : fileInfo.path;
        if (filePath) {
          // Glob returns files, not specific lines, so use line 1, column 1
          locations.push({
            file: filePath,
            line: 1,
            column: 1,
          });
        }
      }

      return {
        type: 'glob',
        count: locations.length,
        locations,
      };
    }

    // files_only mode
    const files = (data.files || []).map((f: any) =>
      typeof f === 'string' ? f : f.path
    ).filter(Boolean);
    return { type: 'glob', count: files.length, files };
  } catch (e) {
    return { type: 'glob', count: 0, error: (e as Error).message };
  }
}

async function executeSymbolsQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode,
  searchRoot: string
): Promise<QueryResult> {
  if (!query.query) {
    return { type: 'symbols', count: 0, error: "Missing 'query' for symbols query" };
  }

  try {
    let mode: 'count_only' | 'names_only' | 'locations';
    if (outputMode === 'count_only') {
      mode = 'count_only';
    } else if (outputMode === 'locations') {
      mode = 'locations';
    } else {
      mode = 'names_only';
    }

    const result = await handlePrecisionSymbols({
      mode: 'workspace',
      query: query.query,
      kinds: query.kinds as Array<'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'property' | 'namespace'>,
      output: {
        mode,
        max_results: 100,
      },
    });

    const content = result.content?.[0];
    if (!content || content.type !== 'text') {
      return { type: 'symbols', count: 0, files: [] };
    }

    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      return { type: 'symbols', count: 0, error: parsed.error };
    }

    const data = parsed.data;

    if (outputMode === 'count_only') {
      return { type: 'symbols', count: data.total_symbols || data.summary?.total_symbols || 0 };
    }

    if (outputMode === 'locations') {
      // Extract locations from symbols
      const locations: LocationInfo[] = [];
      const symbols = data.symbols || [];

      for (const symbol of symbols) {
        if (symbol.file && symbol.line !== undefined && symbol.column !== undefined) {
          locations.push({
            file: symbol.file,
            line: symbol.line,
            column: symbol.column,
            match: symbol.name,
          });
        }
      }

      return {
        type: 'symbols',
        count: locations.length,
        locations,
      };
    }

    // files_only mode - extract unique files
    const symbols = data.symbols || [];
    const files = [...new Set(symbols.map((s: any) => s.file).filter(Boolean))] as string[];
    return { type: 'symbols', count: symbols.length, files };
  } catch (e) {
    return { type: 'symbols', count: 0, error: (e as Error).message };
  }
}

async function executeQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode,
  searchRoot: string
): Promise<QueryResult> {
  switch (query.type) {
    case 'grep':
      return executeGrepQuery(query, outputMode, searchRoot);
    case 'glob':
      return executeGlobQuery(query, outputMode, searchRoot);
    case 'symbols':
      // Note: symbols search currently uses process.cwd() internally
      // and doesn't support base_path override
      return executeSymbolsQuery(query, outputMode, searchRoot);
    default:
      return { count: 0, error: `Unknown query type: ${query.type}` };
  }
}

export const handleDiscover: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as DiscoverInput;
  const outputMode: DiscoverOutputMode = (input.output_mode as DiscoverOutputMode) || (TOOL_SPECIFIC_DEFAULTS.discover?.output_mode as DiscoverOutputMode) || 'files_only';
  const projectRoot = process.cwd();

  try {
    if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('discover', 'queries', 'array of query objects'), { output_mode: 'standard', execution_ms: getElapsed() }));
    }

    // Validate and resolve base_path if provided
    const searchRoot = input.base_path
      ? await validateBasePath(input.base_path, projectRoot)
      : projectRoot;

    // Execute all queries in parallel
    const queryPromises = input.queries.map(async (query) => {
      const result = await executeQuery(query, outputMode, searchRoot);
      return { id: query.id, result };
    });

    const queryResults = await Promise.all(queryPromises);

    // Aggregate results
    const results: Record<string, QueryResult> = {};
    let successful = 0;
    let failed = 0;

    for (const { id, result } of queryResults) {
      results[id] = result;
      if (result.error) {
        failed++;
      } else {
        successful++;
      }
    }

    const data = {
      results,
      total_queries: input.queries.length,
      successful,
      failed,
    };

    return toCallToolResult(successResult(data, 'standard', getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, 'standard', getElapsed()));
  }
};
