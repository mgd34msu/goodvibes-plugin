/**
 * READ Operations interfaces
 * @see SPEC-v2 Section 4.1
 */

import type { OperationBase } from '../operation.js';

export type ExtractMode = 'content' | 'outline' | 'symbols' | 'ast' | 'lines';
export type SearchMode = 'regex' | 'semantic' | 'fuzzy';
export type ContextExpand = 'line' | 'block' | 'function' | 'class';
export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property' | 'enum';
export type SymbolScope = 'workspace' | 'document';
export type UrlExtractMode = 'raw' | 'text' | 'markdown' | 'structured' | 'summary';
export type AnalysisKind = 'dependencies' | 'dead_code' | 'circular_deps' | 'bundle' | 'coverage';

export interface FileReadOperation extends OperationBase {
  type: 'read';
  targets: { path: string; extract?: ExtractMode; lines?: { start: number; end: number; }; }[];
  extract?: ExtractMode;
}

export interface SearchOperation extends OperationBase {
  type: 'search';
  pattern: string;
  mode?: SearchMode;
  paths?: string[];
  glob?: string;
  context?: { before?: number; after?: number; expand?: ContextExpand; };
}

export interface GlobOperation extends OperationBase {
  type: 'glob';
  patterns: string[];
  exclude?: string[];
  filters?: { min_size?: number; max_size?: number; modified_after?: string; modified_before?: string; has_content?: string; is_empty?: boolean; };
}

export interface SymbolOperation extends OperationBase {
  type: 'symbol';
  query: string;
  kinds?: SymbolKind[];
  scope?: SymbolScope;
  files?: string[];
}

export interface UrlOperation extends OperationBase {
  type: 'url';
  targets: { url: string; extract?: UrlExtractMode; }[];
  extract?: UrlExtractMode;
}

export interface AnalyzeOperation extends OperationBase {
  type: 'analyze';
  kind: AnalysisKind;
  options?: Record<string, unknown>;
}

export type ReadOperation = FileReadOperation | SearchOperation | GlobOperation | SymbolOperation | UrlOperation | AnalyzeOperation;
