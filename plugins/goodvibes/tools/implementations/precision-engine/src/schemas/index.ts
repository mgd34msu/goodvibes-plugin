/**
 * Tool schema definitions for precision-engine.
 *
 * VERBOSITY AND OUTPUT FORMAT STANDARDIZATION:
 * - All tools use `verbosity` at top-level (response verbosity control)
 * - Standard verbosity levels: [count_only, minimal, standard, verbose]
 * - Tool-specific verbosity levels (intentional deviations):
 *   - discover: [count_only, files_only, locations] - file discovery context
 *   - precision_symbols: [count_only, names_only, locations, signatures, full] - symbol analysis
 *   - precision_edit: [count_only, minimal, with_diff, verbose] - edit results with diffs
 * - All output-related parameters are optional with sensible defaults
 * - Default verbosity: 'standard' (or tool-specific default)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Common verbosity schema for standard tools.
 * Default: 'standard'
 */
const verbositySchema = {
  type: 'string' as const,
  enum: ['count_only', 'minimal', 'standard', 'verbose'],
  default: 'standard',
  description: 'Response verbosity: count_only (minimal tokens), minimal (basic info), standard (normal), verbose (full details)',
};

/**
 * precision_write - Create/write files with encoding support.
 */
export const precisionWriteSchema: Tool = {
  name: 'precision_write',
  description:
    'Create or write files with encoding support and multiple overwrite modes. ' +
    'Supports batch writes, automatic parent directory creation, and dry_run mode.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Array of files to write',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file to write' },
            content: { type: 'string', description: 'Content to write to the file' },
            content_base64: { type: 'string', description: 'Base64-encoded content. REQUIRED when content contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "content" | base64 -w0' },
            content_file: { type: 'string', description: 'Path to file containing content to write (use instead of content)' },
            encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
            mode: {
              type: 'string',
              enum: ['fail_if_exists', 'overwrite', 'backup'],
              description: 'Behavior when file exists (default: fail_if_exists)',
            },
          },
          required: ['path'],
        },
      },
      dry_run: { type: 'boolean', default: false, description: 'Preview changes without writing' },
      verbosity: verbositySchema,
    },
    required: ['files'],
  },
};

/**
 * precision_exec - Execute shell commands.
 */
export const precisionExecSchema: Tool = {
  name: 'precision_exec',
  description:
    'Execute shell commands with batch support, timeout, and expectations checking. ' +
    'Captures stdout, stderr, and exit code. ' +
    'Supports file_ops (copy, move, delete) that execute BEFORE commands.',
  inputSchema: {
    type: 'object',
    properties: {
      file_ops: {
        type: 'array',
        description: 'File operations to execute BEFORE commands. Runs sequentially. copy/move are unrestricted; delete is restricted to project root.',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['copy', 'move', 'delete'], description: 'Operation type' },
            source: { type: 'string', description: 'Absolute source path (file or directory)' },
            destination: { type: 'string', description: 'Absolute destination path (required for copy and move)' },
            options: {
              type: 'object',
              properties: {
                recursive: { type: 'boolean', default: false, description: 'Copy/delete directories recursively (default: false)' },
                overwrite: { type: 'boolean', default: false, description: 'Overwrite existing destination (default: false)' },
                update_imports: { type: 'boolean', default: false, description: 'Rewrite TS/JS import paths after move (default: false)' },
                dry_run: { type: 'boolean', default: false, description: 'Preview what would be deleted without deleting (default: false)' },
              },
            },
          },
          required: ['op', 'source'],
        },
      },
      commands: {
        type: 'array',
        description: 'Array of commands to execute',
        items: {
          type: 'object',
          properties: {
            cmd: { type: 'string', description: 'Command to execute' },
            cmd_base64: { type: 'string', description: 'Base64-encoded command. REQUIRED when cmd contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "command" | base64 -w0' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout_ms: { type: 'integer', minimum: 1, description: 'Timeout in ms (default: 120000)' },
            timeout: { type: 'integer', minimum: 1, description: 'DEPRECATED: Use timeout_ms instead. Timeout in ms (default: 120000)' },
            env: { type: 'object', description: 'Additional environment variables' },
            background: { type: 'boolean', description: 'Run this command in background (detached). Returns immediately. Use bg_status/bg_output/bg_stop to manage.' },
            until: {
              type: 'object',
              description: 'Pattern-based early termination. Stop capturing when pattern matches in stdout/stderr.',
              properties: {
                pattern: { type: 'string', description: 'Regex pattern to watch for in stdout/stderr' },
                timeout_ms: { type: 'integer', minimum: 100, description: 'Max wait time in ms (default: command timeout)' },
                kill_after: { type: 'boolean', default: false, description: 'Kill process after match? Default false (promotes to background)' },
              },
              required: ['pattern'],
            },
            retry: {
              type: 'object',
              description: 'Retry configuration for transient failures. Retry is OFF by default.',
              properties: {
                max: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: 'Maximum retry attempts' },
                delay_ms: { type: 'integer', minimum: 100, default: 1000, description: 'Base delay between retries in milliseconds' },
                backoff: { type: 'string', enum: ['fixed', 'exponential'], default: 'exponential', description: 'Backoff strategy' },
                on: {
                  type: 'array',
                  items: { type: 'string', enum: ['network', 'lock', 'busy', 'oom'] },
                  default: ['network', 'lock', 'busy'],
                  description: 'Error categories to retry on',
                },
              },
            },
            progress: { type: 'boolean', default: false, description: 'Enable inline progress milestones for long-running commands (auto-enabled for commands >10s)' },
            progress_file: { type: 'boolean', default: false, description: 'Stream output to a pollable progress file. Auto-enabled for timeout_ms > 30000.' },
            expect: {
              type: 'object',
              properties: {
                exit_code: { type: 'integer', description: 'Expected exit code' },
                stdout_contains: { type: 'string', description: 'String that stdout should contain' },
                stderr_contains: { type: 'string', description: 'String that stderr should contain' },
              },
              description: 'Expectations to verify',
            },
          },
          required: ['cmd'],
        },
      },
      working_dir: { type: 'string', description: 'Global working directory for all commands (persists across calls). No default (uses process.cwd()).' },
      background: { type: 'boolean', default: false, description: 'Run commands in background (detached). Returns immediately with process ID. Use bg_list, bg_status <id>, bg_output <id>, bg_stop <id> to manage background processes.' },
      timeout_ms: { type: 'integer', minimum: 1, default: 120000, description: 'Global timeout in ms (default: 120000). Per-command timeout_ms overrides this.' },
      parallel: { type: 'boolean', default: false, description: 'Execute commands in parallel' },
      stop_on_error: { type: 'boolean', default: true, description: 'DEPRECATED: Use fail_fast. Stop on first error (sequential only)' },
      verbosity: verbositySchema,
    },
  },
};

/**
 * precision_fetch - Fetch URLs with extraction formats.
 */
export const precisionFetchSchema: Tool = {
  name: 'precision_fetch',
  description:
    'Fetch URLs with native fetch. Service registry integration for named APIs with auto-auth. ' +
    'Supports batch fetching, extraction modes (raw/text/json/markdown/structured/summary/code_blocks/tables/links/metadata/readable/pdf), ' +
    'custom headers, method override, timeout, and content type detection.',
  inputSchema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        description: 'Array of URL requests to fetch',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'], description: 'HTTP method (default: GET)' },
            headers: { type: 'object', description: 'Custom headers to send' },
            body: { type: 'string', description: 'Request body (for POST/PUT)' },
            body_base64: { type: 'string', description: 'Base64-encoded request body. REQUIRED when body contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "body" | base64 -w0' },
            timeout_ms: { type: 'integer', minimum: 1, description: 'Timeout in ms (default: 30000)' },
            timeout: { type: 'integer', minimum: 1, description: 'DEPRECATED: Use timeout_ms instead. Timeout in ms (default: 30000)' },
            extract: { type: 'string', enum: ['raw', 'text', 'json', 'markdown', 'structured', 'summary', 'code_blocks', 'tables', 'links', 'metadata', 'readable', 'pdf'], description: 'Extraction mode (default: text)' },
            params: { type: 'object', description: 'Query parameters to append to URL (key-value pairs)' },
            body_type: { type: 'string', enum: ['json', 'form', 'multipart', 'raw'], description: 'Body encoding type (default: json when body_data is provided)' },
            body_data: { description: 'Body data to encode. Object for json/form/multipart, string for raw.' },
            service: { type: 'string', description: 'Service name from registry for auto-auth and base URL resolution' },
            auth: {
              type: 'object',
              description: 'Per-request auth override',
              properties: {
                type: { type: 'string', enum: ['none', 'bearer', 'basic', 'api-key', 'custom-headers'], description: 'Auth type to apply for this request' },
                token: { type: 'string', description: 'Bearer token' },
                username: { type: 'string', description: 'Basic auth username' },
                password: { type: 'string', description: 'Basic auth password' },
                header: { type: 'string', description: 'API key header name' },
                key: { type: 'string', description: 'API key value' },
                headers: { type: 'object', description: 'Custom auth headers' },
              },
            },
            selectors: { type: 'array', items: { type: 'string' }, description: 'CSS selectors for structured extraction' },
          },
          required: ['url'],
        },
      },
      parallel: { type: 'boolean', default: true, description: 'Fetch URLs in parallel' },
      extract: { type: 'string', enum: ['raw', 'text', 'json', 'markdown', 'structured', 'summary', 'code_blocks', 'tables', 'links', 'metadata', 'readable', 'pdf'], default: 'text', description: 'Global extraction mode applied to all URLs (default: text). Per-URL extract overrides this.' },
      verbosity: verbositySchema,
    },
    required: ['urls'],
  },
};

/**
 * discover - Lightweight parallel query execution.
 *
 * VERBOSITY DEVIATION: Uses file-discovery specific modes:
 * - count_only: Just counts
 * - files_only: File paths only (default) - optimized for discovery
 * - locations: File paths with line numbers
 */
export const discoverSchema: Tool = {
  name: 'discover',
  description:
    'Execute multiple grep, glob, symbol, or index queries in parallel. ' +
    'Returns results keyed by query ID for efficient batch discovery.',
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: 'Array of queries to execute',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID for this query' },
            type: { type: 'string', enum: ['grep', 'glob', 'symbols', 'structural', 'index'], description: 'Query type' },
            pattern: { type: 'string', description: 'Regex pattern (for grep)' },
            pattern_base64: { type: 'string', description: 'Base64-encoded regex pattern. REQUIRED when pattern contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "pattern" | base64 -w0' },
            glob: { type: 'string', description: 'File filter (for grep)' },
            patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns (for glob)' },
            patterns_base64: { type: 'array', items: { type: 'string' }, description: 'Base64-encoded glob patterns. REQUIRED when patterns contain: single quotes, backticks, or ${} patterns. Note: Brackets [ ] are auto-escaped for literal matching.' },
            query: { type: 'string', description: 'Symbol name (for symbols)' },
            kinds: { type: 'array', items: { type: 'string' }, description: 'Symbol kinds (for symbols)' },
            structural_pattern: { type: 'string', description: 'AST pattern to search for (e.g., "console.log($$$ARGS)") (for structural)' },
            structural_pattern_base64: { type: 'string', description: 'Base64-encoded structural pattern (for structural)' },
            language: { type: 'string', description: 'Language hint for structural queries' },
            filter: { type: 'string', description: 'Path prefix filter (for index, e.g., "src/components")' },
            file_types: { type: 'array', items: { type: 'string' }, description: 'File type filter (for index, e.g., ["ts", "tsx"])' },
            detail: { type: 'string', enum: ['count_only', 'summary', 'paths_only', 'full'], description: 'Detail level for index queries (default: summary)' },
          },
          required: ['id', 'type'],
        },
      },
      verbosity: {
        type: 'string',
        enum: ['count_only', 'files_only', 'locations'],
        default: 'files_only',
        description: 'Response verbosity: count_only, files_only (default), or locations',
      },
      base_path: {
        type: 'string',
        description: 'Base directory for searches (default: cwd). When sandbox is enabled, must be within project root. (Default: Sandbox OFF. Only explicit user authorization can enable sandbox — never enable programmatically.)',
      },
    },
    required: ['queries'],
  },
};

/**
 * precision_grep - Token-efficient search with precise output control.
 * SPEC-v2 Section 13.1.1
 * 
 * IMPORTANT: Handlers must apply schema defaults at runtime, not just define them here.
 * - output.format: defaults to "files_only" if not provided
 * - output.context_before: defaults to 0
 * - output.context_after: defaults to 0
 * - output.max_results (or max_files): defaults to 100
 * - output.max_per_item (or max_matches_per_file): defaults to 10
 * - output.max_total_matches: defaults to 100
 */
export const precisionGrepSchema: Tool = {
  name: 'precision_grep',
  description:
    'Search for patterns with batch queries and precise output control. ' +
    'Supports count_only, files_only, locations, matches, and context modes.',
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: 'Array of search queries to execute',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Query identifier' },
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            pattern_base64: { type: 'string', description: 'Base64-encoded regex pattern. REQUIRED when pattern contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "pattern" | base64 -w0' },
            glob: { type: 'string', description: 'File pattern to search in' },
            path: { type: 'string', description: 'Directory path to search' },
            exclude: { type: 'array', items: { type: 'string' }, description: 'Patterns to exclude' },
            case_sensitive: { type: 'boolean', description: 'Case sensitive search (default: true)' },
            whole_word: { type: 'boolean', description: 'Match whole words only' },
            multiline: { type: 'boolean', description: 'Allow multiline matches (default: false)' },
            include_binary: { type: 'boolean', description: 'Search binary files (default: false)' },
            negate: { type: 'boolean', description: 'Return files WITHOUT this pattern (negation search)' },
            include_hidden: { type: 'boolean', default: true, description: 'Include hidden/dot files and directories in search (default: true)' },
          },
          required: ['id'],
        },
      },
      output: {
        type: 'object',
        properties: {
          format: { type: 'string', description: 'Output data format', enum: ['count_only', 'files_only', 'locations', 'matches', 'context', 'stats'] },
          context_before: { type: 'integer', minimum: 0, description: 'Lines before match (default: 0)' },
          context_after: { type: 'integer', minimum: 0, description: 'Lines after match (default: 0)' },
          expand_to: { type: 'string', enum: ['line', 'block', 'function', 'class'], description: 'Expand match context to enclosing scope' },
          max_results: { type: 'integer', minimum: 1, description: 'Max files to return (alias for max_files, default: 100)' },
          max_files: { type: 'integer', minimum: 1, description: 'DEPRECATED: Use max_results. Max files to return (default: 100)' },
          max_per_item: { type: 'integer', minimum: 1, description: 'Cap per file (alias for max_matches_per_file, default: 10)' },
          max_matches_per_file: { type: 'integer', minimum: 1, description: 'DEPRECATED: Use max_per_item. Cap per file (default: 10)' },
          max_total_matches: { type: 'integer', minimum: 1, description: 'Total cap (default: 100)' },
          max_tokens: { type: 'integer', minimum: 1, description: 'Hard token cap' },
          max_line_length: { type: 'integer', minimum: 1, description: 'Truncate lines longer than this (default: no truncation)' },
          offset: { type: 'integer', minimum: 0, description: 'Skip first N file results for pagination (default: 0)' },
        },
      },
      parallel: { type: 'boolean', default: true, description: 'Run queries in parallel (default: true)' },
      relationships: { type: 'boolean', description: 'Show cross-file import/export relationships for matched symbols' },
      preview_replace: { type: 'string', description: 'Preview replacement string — shows what find-and-replace would look like without writing' },
      ranked: { type: 'boolean', description: 'Rank results by relevance (exact match, exports, recency) instead of file-path order' },
      verbosity: verbositySchema,
    },
    required: ['queries'],
  },
};

/**
 * precision_read - Read files with precise extraction formats.
 * SPEC-v2 Section 13.1.2
 * 
 * IMPORTANT: Handlers must apply schema defaults at runtime, not just define them here.
 * - extract: defaults to "content" if not provided
 * - output.format: defaults to "standard" if not provided
 * - output.include_line_numbers: defaults to true
 * - output.include_metadata: defaults to false
 */
export const precisionReadSchema: Tool = {
  name: 'precision_read',
  description:
    'Token-efficient file reading with extraction formats. ' +
    'Read full content, outlines, symbols, or specific line ranges. ' +
    'Supports per-file range overrides and symbol filtering. ' +
    'Image files (.png, .jpg, .gif, .webp, .svg, etc.) are returned as visual content blocks. ' +
    'PDF files support page-based reading. ' +
    'Jupyter notebooks (.ipynb) return structured cell output.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            extract: { type: 'string', enum: ['content', 'outline', 'symbols', 'ast', 'lines'] },
            range: {
              type: 'object',
              properties: {
                start: { type: 'integer', minimum: 1 },
                end: { type: 'integer', minimum: 1 },
              },
            },
            pages: { type: 'string', description: "Page range for PDF files (e.g., '1-5', '3', '10-20'). Max 20 pages per request." },
            force: { type: 'boolean', default: false, description: 'Bypass size gate and cache. Read full file regardless of size.' },
          },
          required: ['path'],
        },
      },
      extract: { type: 'string', enum: ['content', 'outline', 'symbols', 'ast', 'lines'], default: 'content' },
      symbol_filter: {
        type: 'array',
        items: { type: 'string', enum: ['function', 'method', 'class', 'interface', 'type', 'variable', 'constant', 'enum', 'property', 'namespace'] },
      },
      default_range: {
        type: 'object',
        properties: {
          start: { type: 'integer', minimum: 1 },
          end: { type: 'integer', minimum: 1 },
        },
      },
      pages: { type: 'string', description: "Page range for PDF files (e.g., '1-5', '3', '10-20'). Max 20 pages per request." },
      force: { type: 'boolean', default: false, description: 'Bypass size gate and cache. Read full file regardless of size.' },
      output: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['count_only', 'minimal', 'standard', 'verbose'], default: 'standard', description: 'Output data format' },
          include_line_numbers: { type: 'boolean', default: true },
          include_metadata: { type: 'boolean', default: false },
          max_per_item: { type: 'integer', minimum: 1, description: 'Max lines per file (alias for max_lines_per_file)' },
          max_lines_per_file: { type: 'integer', minimum: 1, description: 'DEPRECATED: Use max_per_item. Max lines per file' },
          max_tokens: { type: 'integer', minimum: 1 },
        },
      },
      token_budget: { type: 'integer', minimum: 1, description: 'Token budget for paginated batch reads. When set, results are binned into pages that fit within the budget.' },
      page: { type: 'integer', minimum: 1, default: 1, description: 'Page number to return when using token_budget pagination (default: 1).' },
      verbosity: verbositySchema,
    },
    required: ['files'],
  },
};

/**
 * precision_glob - Find files with intelligent filtering and presets.
 * SPEC-v2 Section 13.1.3
 */
export const precisionGlobSchema: Tool = {
  name: 'precision_glob',
  description:
    'Token-efficient file finding with filters and optional preview. ' +
    'Supports size/date filters, content matching, sorting, and gitignore.',
  inputSchema: {
    type: 'object',
    properties: {
      patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to match' },
      patterns_base64: { type: 'array', items: { type: 'string' }, description: 'Base64-encoded glob patterns. REQUIRED when patterns contain: single quotes, backticks, or ${} patterns. Encode each with: echo -n "pattern" | base64 -w0. Note: Brackets [ ] are auto-escaped for literal matching. Use patterns parameter for character-class globs like *.[tj]s' },
      preset: { type: 'string', enum: ['typescript', 'javascript', 'styles', 'config', 'tests', 'all'] },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Patterns to exclude' },
      filters: {
        type: 'object',
        properties: {
          min_size: { type: 'integer', minimum: 0, description: 'Minimum file size in bytes' },
          max_size: { type: 'integer', minimum: 0, description: 'Maximum file size in bytes' },
          modified_after: { type: 'string', format: 'date-time', description: 'ISO date - files modified after' },
          modified_before: { type: 'string', format: 'date-time', description: 'ISO date - files modified before' },
          has_content: { type: 'string', description: 'Regex to match in file content (quick grep filter)' },
          is_empty: { type: 'boolean', description: 'Filter for empty files' },
        },
      },
      output: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['count_only', 'paths_only', 'with_stats', 'with_preview'], default: 'paths_only', description: 'Output verbosity mode' },
          max_results: { type: 'integer', minimum: 1, default: 100, description: 'Maximum files to return (alias for max_files)' },
          max_files: { type: 'integer', minimum: 1, default: 100, description: 'DEPRECATED: Use max_results. Maximum files to return' },
          sort_by: { type: 'string', enum: ['name', 'size', 'modified'], description: 'Sort results by field' },
          sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'asc', description: 'Sort order (ascending or descending)' },
          preview_lines: { type: 'integer', minimum: 1, default: 3, description: 'Lines to preview for with_preview mode' },
          max_tokens: { type: 'integer', minimum: 1, description: 'Hard token cap for output' },
        },
      },
      respect_gitignore: { type: 'boolean', default: true, description: 'Respect .gitignore rules' },
      follow_symlinks: { type: 'boolean', default: false, description: 'Follow symbolic links' },
      include_hidden: { type: 'boolean', default: true, description: 'Include hidden/dot files and directories (e.g. .git, .config). Enabled by default for widest search coverage.' },
      backend: { type: 'string', enum: ['auto', 'fast-glob', 'ripgrep'], description: 'File listing backend' },
      base_path: { type: 'string', description: 'Base directory for glob patterns (defaults to process.cwd())' },
      cwd: { type: 'string', description: 'DEPRECATED: Use base_path instead. Working directory for glob patterns (defaults to process.cwd())' },
      verbosity: verbositySchema,
    },
  },
};

/**
 * precision_symbols - Search and analyze code symbols.
 * SPEC-v2 Section 13.1.4 compliant.
 *
 * VERBOSITY DEVIATION: Uses symbol-analysis specific modes:
 * - count_only: Just counts
 * - names_only: Symbol names only
 * - locations: Names with file:line (default)
 * - signatures: Includes type signatures
 * - full: Complete symbol information
 */
export const precisionSymbolsSchema: Tool = {
  name: 'precision_symbols',
  description:
    'Token-efficient symbol search across workspace or specific files. ' +
    'Supports workspace-wide symbol search and per-file symbol extraction.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['workspace', 'document'], default: 'workspace' },
      query: { type: 'string', description: 'Symbol name pattern (workspace mode)' },
      files: { type: 'array', items: { type: 'string' }, description: 'Files to analyze (document mode)' },
      language: { type: 'string', enum: ['auto', 'typescript', 'python', 'rust', 'go'], description: 'Language to search' },
      kinds: {
        type: 'array',
        items: { type: 'string', enum: ['function', 'method', 'class', 'interface', 'type', 'variable', 'constant', 'enum', 'property', 'namespace'] },
      },
      exported_only: { type: 'boolean', default: false },
      include_private: { type: 'boolean', default: false },
      output: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['count_only', 'names_only', 'locations', 'signatures', 'full'], default: 'locations', description: 'Output data format' },
          max_results: { type: 'integer', minimum: 1, default: 100 },
          group_by: { type: 'string', enum: ['file', 'kind', 'none'], default: 'none' },
          max_tokens: { type: 'integer', minimum: 1 },
        },
      },
      verbosity: {
        type: 'string',
        enum: ['count_only', 'names_only', 'locations', 'signatures', 'full'],
        default: 'locations',
        description: 'Response verbosity for symbol output',
      },
    },
    required: [],
  },
};

/**
 * Validation step types per SPEC-v2 Section 13.1.5.
 */
const validationStepSchema = {
  type: 'string' as const,
  enum: ['typecheck', 'lint', 'test', 'build', 'env', 'api_contract', 'secrets', 'permissions'],
  description: 'Validation step to run',
};

/**
 * precision_notebook - Jupyter Notebook cell editing
 */
export const precisionNotebookSchema: Tool = {
  name: 'precision_notebook',
  description:
    'Edit Jupyter notebook (.ipynb) cells with batch operations. ' +
    'Supports replace, insert, and delete with index or cell_id targeting and automatic index adjustment.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the .ipynb notebook file' },
      operations: {
        type: 'array',
        description: 'Array of cell operations to apply in order',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['replace', 'insert', 'delete'],
              description: 'Operation type',
            },
            cell: {
              type: 'integer',
              minimum: 0,
              description: 'Cell index (0-based). Required for replace and delete (unless cell_id is provided).',
            },
            cell_id: {
              type: 'string',
              description: 'Cell ID (from notebook metadata). Alternative to index-based targeting. If both cell/after and cell_id are provided, cell_id takes precedence.',
            },
            after: {
              type: 'integer',
              minimum: -1,
              description: 'Insert after this cell index (-1 for beginning). Required for insert (unless cell_id is provided).',
            },
            source: {
              type: 'string',
              description: 'New cell source content. Required for replace and insert.',
            },
            cell_type: {
              type: 'string',
              enum: ['code', 'markdown', 'raw'],
              description: 'Cell type. Required for insert, optional for replace.',
            },
            clear_outputs: {
              type: 'boolean',
              description: 'Clear cell outputs on replace (default: false)',
            },
          },
          required: ['op'],
        },
      },
      verbosity: verbositySchema,
    },
    required: ['path', 'operations'],
  },
};

/**
 * precision_config - Runtime configuration management.
 */
export const precisionConfigSchema: Tool = {
  name: 'precision_config',
  description:
    'Get or set precision-engine runtime configuration. ' +
    'Supports toggling sandbox mode (path boundary enforcement) and other settings.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'set', 'reload', 'telemetry', 'state', 'hooks', 'mode'],
        description:
          'Action to perform: ' +
          'get (read config), ' +
          'set (update config), ' +
          'reload (reload from file), ' +
          'telemetry (query usage telemetry), ' +
          'state (per-session KV store: get/set/list/clear), ' +
          'hooks (manage precision tool hooks: list/enable/disable/add/remove), ' +
          'mode (manage output mode: get/set/list — modes: vibecoding, justvibes, default)',
      },
      key: {
        type: 'string',
        description: 'Config key to get or set. Available keys: sandbox (boolean), cache_mode ("hash_only"|"with_content", default: with_content), cache_max_mb (number, default: 200, minimum: 1), safe_overwrite (boolean, default: true), backup_dir (string, default: ".goodvibes/.backups"), backup_git_clean_skip (boolean, default: true), slow_fs_stat_threshold_ms (number), slow_fs_known_prefixes (string[]), max_file_bytes (number), max_token_estimate (number), max_diff_chars (number, default: 10000), page_size_lines (number), verbosity_defaults (object), exec_max_output_chars (number, default: 50000), exec_default_timeout_ms (number, default: 120000), exec_max_output_lines (number, default: 500), exec_overflow_dir (string, default: ".goodvibes/.overflow"), exec_max_background (number, default: 10), exec_history_max (number, default: 100), discover_symbol_timeout_ms (number, default: 60000), fetch.services (virtual key - returns list of registered API services with metadata, no credentials), fetch.auth_status (virtual key - returns authentication status per service). Omit for get to return all config.',
      },
      value: {
        // Intentionally no type constraint - accepts any JSON value (boolean, string, number)
        description: 'Value to set (for set action). Type depends on the key.',
      },
      operation: {
        type: 'string',
        enum: ['get', 'set', 'list', 'clear', 'summary', 'query', 'enable', 'disable', 'add', 'remove'],
        description:
          'Sub-operation for action=state (get/set/list/clear), action=telemetry (summary/query), or action=hooks (list/enable/disable/add/remove). ' +
          'For action=state: get, set, list, clear. For action=telemetry: summary, query. ' +
          'For action=hooks: list (all hooks), enable/disable (toggle by name), add (new hook), remove (by name). ' +
          'Invalid combinations (e.g. action=state with operation=summary) return a runtime error. ' +
          'state/get: retrieve values for specified keys. ' +
          'state/set: store key-value pairs in session state. ' +
          'state/list: list all keys, optionally filtered by prefix. ' +
          'state/clear: remove specified keys.',
      },
      keys: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For action=state, operation=get or clear: array of key names to retrieve or delete.',
      },
      values: {
        type: 'object',
        description:
          'For action=state, operation=set: key-value pairs to store in session state. ' +
          'Keys "id" and "started_at" are protected and silently ignored.',
      },
      prefix: {
        type: 'string',
        description:
          'For action=state, operation=list: only return keys starting with this prefix. ' +
          'Omit to return all session state.',
      },
      filter: {
        type: 'object',
        description: 'Filter parameters for action=telemetry operation=query.',
        properties: {
          tool: { type: 'string', description: 'Filter by tool name (e.g. "read", "write", "precision_grep")' },
          status: { type: 'string', enum: ['success', 'failed', 'partial'], description: 'Filter by call status' },
          session_id: { type: 'string', description: 'Filter by session ID (8-char hex). Defaults to current session.' },
          since: { type: 'string', description: 'ISO 8601 timestamp — only return records at or after this time' },
          limit: { type: 'integer', minimum: 1, description: 'Maximum number of records to return' },
        },
      },
      mode: {
        type: 'string',
        description:
          'For action=mode, operation=set: the mode name to activate. ' +
          'Built-in modes: vibecoding (enforce DPB + precision tools, token-efficient defaults), ' +
          'justvibes (same defaults, minimal enforcement), ' +
          'default (no enforcement, standard defaults). ' +
          'Custom modes can be registered at runtime via ModeManager.registerMode().',
      },
      event: {
        type: 'string',
        enum: ['PrePrecisionTool', 'PostPrecisionTool', 'OnPrecisionError', 'OnPrecisionMutation'],
        description:
          'For action=hooks: the hook event to operate on. ' +
          'PrePrecisionTool: runs before any tool call (can abort). ' +
          'PostPrecisionTool: runs after successful tool call. ' +
          'OnPrecisionError: runs on tool failure. ' +
          'OnPrecisionMutation: runs after write/edit/exec/file_op.',
      },
      hook: {
        description:
          'For action=hooks: the hook identifier (string name/cmd) for enable/disable/remove operations, ' +
          'or a HookConfig object for the add operation. ' +
          'HookConfig: { type: "builtin"|"script"|"mcp", name?: string, cmd?: string, mcp_tool?: string, ' +
          'filter?: { tool?: string[] }, enabled?: boolean, timeout_ms?: number }',
      },
    },
    required: ['action'],
  },
};

/**
 * precision_edit - Token-efficient file editing with atomic transactions.
 *
 * SPEC-v2 Section 13.1.5 compliant.
 * Replaces: System `Edit` tool
 *
 * VERBOSITY DEVIATION: Uses edit-specific modes:
 * - count_only: Just counts
 * - minimal: Summary only (default for dry_run=false)
 * - with_diff: Includes unified diff (default for dry_run=true)
 * - verbose: Full details with validation results
 */
export const precisionEditSchema: Tool = {
  name: 'precision_edit',
  description:
    'Token-efficient file editing with atomic transactions, ' +
    'conflict detection, and validation. Supports exact, fuzzy, regex, and AST matching formats.',
  inputSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            path: { type: 'string', description: 'Path to the file to edit' },
            file: { type: 'string', description: 'DEPRECATED: Use path instead. Path to the file to edit' },
            find: { type: 'string' },
            replace: { type: 'string' },
            find_base64: { type: 'string', description: 'Base64-encoded text to find. REQUIRED when find contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "find text" | base64 -w0' },
            replace_base64: { type: 'string', description: 'Base64-encoded replacement text. REQUIRED when replace contains: single quotes, backticks, or ${} patterns. Encode with: echo -n "replacement" | base64 -w0' },
            occurrence: {
              oneOf: [
                { type: 'string', enum: ['first', 'last', 'all'] },
                { type: 'integer', minimum: 1 },
              ],
            },
            hints: {
              type: 'object',
              properties: {
                near_line: { type: 'integer' },
                in_function: { type: 'string' },
                in_class: { type: 'string' },
                after: { type: 'string' },
                before: { type: 'string' },
              },
            },
          },
          required: ['path', 'find', 'replace'],
        },
      },
      transaction: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['atomic', 'partial', 'none'], default: 'atomic' },
          rollback_on_fail: { type: 'boolean', default: true },
        },
      },
      match: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['exact', 'fuzzy', 'regex', 'ast', 'ast_pattern'], default: 'exact' },
          case_sensitive: { type: 'boolean', default: true },
          whitespace_sensitive: { type: 'boolean', default: true },
        },
      },
      validate: {
        type: 'object',
        properties: {
          before: { type: 'array', items: { type: 'string', enum: ['typecheck', 'lint', 'test', 'build'] } },
          after: { type: 'array', items: { type: 'string', enum: ['typecheck', 'lint', 'test', 'build'] } },
        },
      },
      dry_run: { type: 'boolean', default: false },
      output: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['count_only', 'minimal', 'with_diff', 'verbose'], default: 'minimal', description: 'Output data format' },
          diff_context: { type: 'integer', minimum: 0, default: 3 },
          max_tokens: { type: 'integer', minimum: 1 },
        },
      },
      verbosity: {
        type: 'string',
        enum: ['count_only', 'minimal', 'with_diff', 'verbose'],
        default: 'with_diff',
        description: 'Response verbosity for edit output',
      },
    },
    required: ['edits'],
  },
};

/**
 * precision_agent - Spawn headless AI sessions across providers.
 * Phase 5I: Orchestration-level agent spawning from MCP tool layer.
 */
export const precisionAgentSchema: Tool = {
  name: 'precision_agent',
  description:
    'Spawn a headless AI session across multiple providers (Claude, Gemini, Codex). ' +
    'Supports background (non-blocking) and foreground (blocking) execution. ' +
    'Optionally injects context files and a project dossier into the agent prompt.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Task prompt for the agent. Required.',
      },
      context_files: {
        type: 'array',
        description: 'File paths whose content is read and injected into the prompt.',
        items: { type: 'string' },
      },
      scope: {
        type: 'array',
        description:
          'File/directory paths that define the task scope (e.g. ["src/auth/", "src/middleware/"]). ' +
          'Injected into dossier for context-relevant memory matching.',
        items: { type: 'string' },
      },
      acceptance_criteria: {
        type: 'array',
        description: 'Specific criteria the task must meet. Injected into dossier to guide agent focus.',
        items: { type: 'string' },
      },
      options: {
        type: 'object',
        description: 'Execution and provider options.',
        properties: {
          provider: {
            type: 'string',
            enum: ['claude', 'gemini', 'codex'],
            default: 'claude',
            description: 'AI provider to use.',
          },
          model: {
            type: 'string',
            description: 'Model override — provider-specific (e.g. "sonnet", "opus", "gemini-2.5-pro").',
          },
          cli_flags: {
            type: 'object',
            description: 'Provider-specific CLI flags passed through as-is (e.g. { "disallowedTools": "Write,Edit" }).',
            additionalProperties: true,
          },
          max_cost: {
            type: ['number', 'null'],
            description: 'Maximum cost in USD — placeholder for future budget engine.',
          },
          max_tokens: {
            type: ['integer', 'null'],
            description: 'Maximum tokens — placeholder for future budget engine.',
          },
          background: {
            type: 'boolean',
            description:
              'Run in background (non-blocking). ' +
              'Default: true in main conversation, false in subagent context.',
          },
          timeout_ms: {
            type: 'integer',
            minimum: 1,
            default: 1800000,
            description:
              'Timeout in milliseconds for blocking mode execution. ' +
              'Default: 1800000 (30 minutes). Has no effect in background mode.',
          },
          dossier: {
            type: 'object',
            description: 'Dossier integration options.',
            properties: {
              include: {
                type: 'boolean',
                default: true,
                description: 'Whether to generate and inject a project dossier into the prompt.',
              },
              extra_reminders: {
                type: 'array',
                items: { type: 'string' },
                description: 'Extra reminder strings appended to the dossier reminders section.',
              },
            },
          },
        },
      },
    },
    required: ['prompt'],
  },
};

/**
 * All tool schemas - SPEC-v2 tools only.
 */
export const allSchemas: Tool[] = [
  precisionWriteSchema,
  precisionExecSchema,
  precisionFetchSchema,
  discoverSchema,
  precisionGrepSchema,
  precisionReadSchema,
  precisionGlobSchema,
  precisionSymbolsSchema,
  precisionEditSchema,
  precisionConfigSchema,
  precisionNotebookSchema,
  precisionAgentSchema,
];
