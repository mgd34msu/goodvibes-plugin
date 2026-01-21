/**
 * READ Operations interfaces
 * @see SPEC-v2 Section 4.1
 */

// === Type Aliases ===

export type ExtractMode = 'content' | 'outline' | 'symbols' | 'ast' | 'lines';

export type SearchMode = 'regex' | 'semantic' | 'fuzzy';

export type SymbolKind =
  | 'function' | 'method' | 'class' | 'interface'
  | 'type' | 'variable' | 'constant' | 'enum'
  | 'property' | 'constructor' | 'namespace';

export type UrlExtractMode = 'raw' | 'markdown' | 'text' | 'structured';

export type AnalysisKind =
  | 'dependencies' | 'dead_code' | 'circular_deps'
  | 'tech_debt' | 'bundle' | 'coverage'
  | 'stack' | 'api_surface' | 'breaking_changes';

// === Shared Interfaces ===

export interface FileSpec {
  path: string;
  offset?: number;               // Start line (1-based)
  limit?: number;                // Number of lines
  encoding?: string;
}

// === Discriminated Union (SPEC-v2 Section 4.1) ===

export type ReadOperation =
  | {
      type: 'files';
      id: string;
      targets: (string | FileSpec)[];
      extract: ExtractMode;
      options?: {
        include_line_numbers?: boolean;
        symbol_filter?: SymbolKind[];
        max_lines?: number;
      };
    }
  | {
      type: 'search';
      id: string;
      pattern: string;
      mode: SearchMode;
      glob?: string;
      context?: {
        before: number;
        after: number;
        max_per_file?: number;
      };
      options?: {
        case_sensitive?: boolean;
        whole_word?: boolean;
        dedupe?: boolean;
        relevance_threshold?: number;  // For semantic search
      };
    }
  | {
      type: 'glob';
      id: string;
      patterns: string[];
      exclude?: string[];
      filters?: {
        min_size?: number;
        max_size?: number;
        modified_after?: string;
        modified_before?: string;
        has_content?: string;        // Quick grep filter
      };
      options?: {
        respect_gitignore?: boolean;
        preview_lines?: number;
        include_stats?: boolean;
      };
    }
  | {
      type: 'symbols';
      id: string;
      query: string;
      kinds?: SymbolKind[];
      scope?: string;                // Glob pattern for files to search
      options?: {
        include_location?: boolean;
        include_signature?: boolean;
        max_results?: number;
      };
    }
  | {
      type: 'url';
      id: string;
      targets: string[];
      extract: UrlExtractMode;
      options?: {
        cache_ttl_seconds?: number;
        selectors?: string[];        // CSS selectors for structured
        summarize?: boolean;
        max_tokens?: number;
      };
    }
  | {
      type: 'analyze';
      id: string;
      kind: AnalysisKind;
      target?: string;
      options?: Record<string, unknown>;
    };
