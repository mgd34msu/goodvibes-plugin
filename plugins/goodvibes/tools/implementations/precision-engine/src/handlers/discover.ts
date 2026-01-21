/**
 * discover handler - Lightweight parallel query execution for finding files/symbols
 */

import { startTimer } from '../logging.js';
import type { OutputMode, PrecisionResult } from '../types.js';
import { toCallToolResult, ToolHandler, successResult, errorResult, parseOutputMode } from '../utils/index.js';
import { handlePrecisionGrep } from './precision-grep.js';
import { handlePrecisionGlob } from './precision-glob.js';
import { handlePrecisionSymbols } from './precision-symbols.js';

type DiscoverOutputMode = 'count_only' | 'files_only' | 'locations';

interface QuerySpec {
  id: string;
  type: 'grep' | 'glob' | 'symbols';
  // For grep:
  pattern?: string;
  glob?: string;
  // For glob:
  patterns?: string[];
  // For symbols:
  query?: string;
  kinds?: string[];
}

interface DiscoverInput {
  queries: QuerySpec[];
  output_mode?: DiscoverOutputMode;
}

interface QueryResult {
  count: number;
  files?: string[];
  locations?: Array<{ file: string; line: number }>;
  error?: string;
}

async function executeGrepQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode
): Promise<QueryResult> {
  if (!query.pattern) {
    return { count: 0, error: "Missing 'pattern' for grep query" };
  }

  try {
    const mode = outputMode === 'count_only' ? 'count_only' : 'files_only';
    const result = await handlePrecisionGrep({
      queries: [{
        id: 'discover-grep',
        pattern: query.pattern,
        glob: query.glob,
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
      return { count: 0, files: [] };
    }

    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      return { count: 0, error: parsed.error };
    }

    const data = parsed.data;

    if (outputMode === 'count_only') {
      const count = data.results?.['discover-grep']?.total_matches || 0;
      return { count };
    }

    const files = data.results?.['discover-grep']?.files || [];
    return { count: files.length, files };
  } catch (e) {
    return { count: 0, error: (e as Error).message };
  }
}

async function executeGlobQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode
): Promise<QueryResult> {
  if (!query.patterns || query.patterns.length === 0) {
    return { count: 0, error: "Missing 'patterns' for glob query" };
  }

  try {
    const mode = outputMode === 'count_only' ? 'count_only' : 'paths_only';
    const result = await handlePrecisionGlob({
      patterns: query.patterns,
      output: {
        mode,
        max_files: 100,
      },
      output_mode: 'minimal',
    });

    const content = result.content?.[0];
    if (!content || content.type !== 'text') {
      return { count: 0, files: [] };
    }

    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      return { count: 0, error: parsed.error };
    }

    const data = parsed.data;

    if (outputMode === 'count_only') {
      return { count: data.total_files || 0 };
    }

    const files = data.files || [];
    return { count: files.length, files };
  } catch (e) {
    return { count: 0, error: (e as Error).message };
  }
}

async function executeSymbolsQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode
): Promise<QueryResult> {
  if (!query.query) {
    return { count: 0, error: "Missing 'query' for symbols query" };
  }

  try {
    const mode = outputMode === 'count_only' ? 'count_only' : 'names_only';
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
      return { count: 0, files: [] };
    }

    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      return { count: 0, error: parsed.error };
    }

    const data = parsed.data;

    if (outputMode === 'count_only') {
      return { count: data.total_symbols || 0 };
    }

    const symbols = data.symbols || [];
    // Extract unique files from symbols
    const files = [...new Set(symbols.map((s: any) => s.file).filter(Boolean))] as string[];
    return { count: symbols.length, files };
  } catch (e) {
    return { count: 0, error: (e as Error).message };
  }
}

async function executeQuery(
  query: QuerySpec,
  outputMode: DiscoverOutputMode
): Promise<QueryResult> {
  switch (query.type) {
    case 'grep':
      return executeGrepQuery(query, outputMode);
    case 'glob':
      return executeGlobQuery(query, outputMode);
    case 'symbols':
      return executeSymbolsQuery(query, outputMode);
    default:
      return { count: 0, error: `Unknown query type: ${query.type}` };
  }
}

export const handleDiscover: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as DiscoverInput;
  const outputMode: DiscoverOutputMode = (input.output_mode as DiscoverOutputMode) || 'files_only';

  try {
    if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
      return toCallToolResult(errorResult('queries array is required', 'standard', getElapsed()));
    }

    // Execute all queries in parallel
    const queryPromises = input.queries.map(async (query) => {
      const result = await executeQuery(query, outputMode);
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
