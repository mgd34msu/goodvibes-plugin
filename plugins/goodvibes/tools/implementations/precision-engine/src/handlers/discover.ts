/**
 * discover handler - Lightweight parallel query execution for finding files/symbols
 */

import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode, resolveStringField, parseJsonField } from '../utils/index.js';
import { TOOL_SPECIFIC_DEFAULTS } from '../utils/index.js';
import { formatMissingParamError, createErrorResult } from '../utils/errors.js';
import { handlePrecisionGrep } from './precision-grep.js';
import { handlePrecisionGlob } from './precision-glob.js';
import { handlePrecisionSymbols } from './precision-symbols.js';
import { RipgrepCore } from '../core/ripgrep.js';
import { TreeSitterCore } from '../core/tree-sitter.js';
import { AstGrepCore } from '../core/ast-grep.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { validateDirectoryPath } from '../utils/path-validation.js';
import fg from 'fast-glob';
import { DEFAULT_EXCLUDES } from '../config.js';
import { getDiscoverSymbolTimeout } from '../runtime-config.js';
import { ProjectIndex, categorizeFileType } from '../state/project-index.js';

type DiscoverOutputMode = 'count_only' | 'files_only' | 'locations';

// Lazy-loaded core instances
let ripgrepInstance: RipgrepCore | null = null;
let treeSitterInstance: TreeSitterCore | null = null;
let astGrepInstance: AstGrepCore | null = null;

function getRipgrep(): RipgrepCore {
  if (!ripgrepInstance) ripgrepInstance = new RipgrepCore();
  return ripgrepInstance;
}

function getTreeSitter(): TreeSitterCore {
  if (!treeSitterInstance) treeSitterInstance = new TreeSitterCore();
  return treeSitterInstance;
}

function getAstGrep(): AstGrepCore {
  if (!astGrepInstance) astGrepInstance = new AstGrepCore();
  return astGrepInstance;
}


interface QuerySpec {
  id: string;
  type: 'grep' | 'glob' | 'symbols' | 'structural' | 'index';
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
  // For structural (ast-grep):
  structural_pattern?: string;
  structural_pattern_base64?: string;
  language?: string;
  // For index:
  filter?: string;
  file_types?: string[];
  detail?: 'count_only' | 'summary' | 'paths_only' | 'full';
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
  type?: 'grep' | 'glob' | 'symbols' | 'structural' | 'index';
  count: number;
  files?: string[] | Array<{ path: string; type?: string }>;
  locations?: LocationInfo[];
  stats?: any;
  type_counts?: Record<string, number>;
  error?: string;
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
        include_hidden: true,
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
    ? query.patterns_base64.map(p => {
        const decoded = Buffer.from(p, 'base64').toString('utf-8');
        // Escape brackets for literal matching (consistent with precision_glob)
        return decoded.replace(/[\[\]]/g, '\\$&');
      })
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
      include_hidden: true,
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

  // Helper: Get glob patterns for symbol search
  function getGlobPatterns(): string[] {
    return ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.rs', '**/*.go'];
  }

  // If searchRoot is different from cwd, we need to scope the search
  const needsScoping = searchRoot !== process.cwd();
  let scopedFiles: string[] | undefined;

  if (needsScoping) {
    try {
      // Get files from searchRoot to scope the symbol search
      const patterns = getGlobPatterns();
      scopedFiles = await fg(patterns, {
        cwd: searchRoot,
        ignore: DEFAULT_EXCLUDES,
        absolute: true,
      });

      // If no files found in searchRoot, return empty result
      if (scopedFiles.length === 0) {
        return { type: 'symbols', count: 0, files: [] };
      }
    } catch (e) {
      return { type: 'symbols', count: 0, error: `Failed to scan directory: ${(e as Error).message}` };
    }
  }

  let timeoutId: NodeJS.Timeout;
  try {
    const mode = outputMode === 'count_only' ? 'count_only' : 'locations';

    // Add timeout protection
    const symbolsPromise = handlePrecisionSymbols({
      mode: needsScoping ? 'document' : 'workspace',
      files: scopedFiles, // Only set when needsScoping is true
      query: query.query,
      kinds: query.kinds as Array<'function' | 'method' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'enum' | 'property' | 'namespace'>,
      output: {
        mode,
        max_results: 100,
      },
    });

    const symbolTimeout = getDiscoverSymbolTimeout();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Symbol search timeout after ${symbolTimeout / 1000}s`)), symbolTimeout);
    });

    const result = await Promise.race([symbolsPromise, timeoutPromise]);

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
    return {
      type: 'symbols',
      count: 0,
      error: `Symbol search failed: ${(e as Error).message}`
    };
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function executeStructuralQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode,
  searchRoot: string
): Promise<QueryResult> {
  // Resolve structural_pattern (supports regular strings and base64)
  let patternValue: string;
  try {
    patternValue = resolveStringField(query as unknown as Record<string, unknown>, 'structural_pattern', {
      allowFile: false,
      basePath: process.cwd(),
      required: true,
      fieldName: 'structural_pattern'
    });
  } catch (error) {
    return { type: 'structural', count: 0, error: (error as Error).message };
  }

  try {
    const astGrep = getAstGrep();
    
    const result = await astGrep.search({
      pattern: patternValue,
      path: searchRoot,
      glob: query.glob || '**/*',
      language: query.language,
    });

    if (outputMode === 'count_only') {
      return { type: 'structural', count: result.matchCount };
    }

    if (outputMode === 'locations') {
      // Convert ast-grep matches to LocationInfo format
      const locations: LocationInfo[] = result.matches.map(match => ({
        file: match.file,
        line: match.line,
        column: match.column,
        match: match.matchText,
      }));

      return {
        type: 'structural',
        count: locations.length,
        locations,
      };
    }

    // files_only mode - extract unique files
    const files = [...new Set(result.matches.map(m => m.file))];
    return { type: 'structural', count: result.matchCount, files };
  } catch (e) {
    return { type: 'structural', count: 0, error: (e as Error).message };
  }
}

async function executeIndexQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode,
  searchRoot: string
): Promise<QueryResult> {
  const projectIndex = ProjectIndex.getInstance();
  const index = await projectIndex.getIndexLoaded();

  if (!index) {
    return { count: 0, error: 'Project index not available. Will be created on next session start.' };
  }

  let files = projectIndex.getFiles();

  // Apply filters
  if (query.filter) {
    // Note: filter matches path PREFIX, not directory boundary.
    // e.g., "src/comp" matches both "src/company/" and "src/components/"
    // This is intentional to support file-level prefix matching.
    files = projectIndex.getFilesByPrefix(query.filter);
  }
  if (query.file_types && query.file_types.length > 0) {
    const types = new Set(query.file_types);
    files = files.filter(f => types.has(categorizeFileType(f.p)));
  }

  const detail = query.detail || 'summary';
  const isFiltered = !!(query.filter || (query.file_types && query.file_types.length > 0));

  // Return appropriate detail level
  switch (detail) {
    case 'count_only':
      return { type: 'index', count: files.length, ...(isFiltered ? {} : { stats: index.stats }) };
    case 'summary':
      return { type: 'index', count: files.length, ...(isFiltered ? {} : { stats: index.stats }), type_counts: projectIndex.getTypeCounts() };
    case 'paths_only':
      return { type: 'index', count: files.length, files: files.map(f => f.p) };
    case 'full':
      return { type: 'index', count: files.length, files: files.map(f => ({ path: f.p, type: categorizeFileType(f.p) })) };
    default:
      return { type: 'index', count: files.length, ...(isFiltered ? {} : { stats: index.stats }), type_counts: projectIndex.getTypeCounts() };
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
      // Symbols search scopes via document mode when base_path differs from cwd
      return executeSymbolsQuery(query, outputMode, searchRoot);
    case 'structural':
      return executeStructuralQuery(query, outputMode, searchRoot);
    case 'index':
      return executeIndexQuery(query, outputMode, searchRoot);
    default:
      return { count: 0, error: `Unknown query type: ${query.type}` };
  }
}

export const handleDiscover: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const rawInput = args as DiscoverInput;
  const input = { ...rawInput, queries: parseJsonField(rawInput.queries) } as DiscoverInput;
  const outputMode: DiscoverOutputMode = (input.output_mode as DiscoverOutputMode) || (TOOL_SPECIFIC_DEFAULTS.discover?.output_mode as DiscoverOutputMode) || 'files_only';
  const projectRoot = process.cwd();

  try {
    if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
      return toCallToolResult(createErrorResult(formatMissingParamError('discover', 'queries', 'array of query objects'), { output_mode: 'standard', execution_ms: getElapsed() }));
    }

    // Auto-inject project index query if not already present
    const hasIndexQuery = input.queries.some(q => q.type === 'index');
    if (!hasIndexQuery) {
      input.queries.push({ id: '_project_index', type: 'index', detail: 'summary' });
    }

    // Validate and resolve base_path if provided
    const searchRoot = input.base_path
      ? await validateDirectoryPath(input.base_path, projectRoot)
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
      // _project_index is auto-injected and should not affect user-visible counts
      if (id === '_project_index') continue;
      if (result.error) {
        failed++;
      } else {
        successful++;
      }
    }

    // total_queries reflects only user-submitted queries (not the auto-injected _project_index)
    const userQueryCount = input.queries.filter(q => q.id !== '_project_index').length;

    const data = {
      results,
      total_queries: userQueryCount,
      successful,
      failed,
    };

    return toCallToolResult(successResult(data, 'standard', getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, 'standard', getElapsed()));
  }
};
