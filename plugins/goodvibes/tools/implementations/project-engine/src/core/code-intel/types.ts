/**
 * Code Intelligence Domain Types
 *
 * All shared types for the code-intel domain extracted from handler sources.
 *
 * @module core/code-intel/types
 */

import type ts from 'typescript';
import type { McpResponse } from '../../shared/types.js';

// =============================================================================
// Language Service Types
// =============================================================================

/**
 * Result from getting a TypeScript Language Service for a file.
 */
export interface LanguageServiceResult {
  /** The TypeScript language service */
  service: ts.LanguageService;
  /** The compiled TypeScript program */
  program: ts.Program;
  /** Path to the tsconfig.json used, or null if none found */
  configPath: string | null;
}

/**
 * Interface for managing TypeScript Language Service instances.
 */
export interface LanguageServiceManager {
  /** Get or create a Language Service for the given file */
  getServiceForFile(filePath: string): Promise<LanguageServiceResult>;
  /** Clean up cached services older than TTL */
  cleanup(): void;
  /** Shutdown the manager and dispose all services */
  shutdown(): void;
  /** Start the periodic cleanup interval */
  startCleanupInterval(): void;
  /** Get cache TTL in milliseconds */
  getCacheTTL(): number;
}

/**
 * Internal cached Language Service entry.
 */
export interface CachedService {
  /** The TypeScript language service */
  service: ts.LanguageService;
  /** The language service host */
  host: ts.LanguageServiceHost;
  /** Path to the tsconfig.json, or null */
  configPath: string | null;
  /** Compiler options in use */
  compilerOptions: ts.CompilerOptions;
  /** In-memory file cache */
  files: Map<string, { version: number; content: string; snapshot: ts.IScriptSnapshot }>;
  /** Timestamp of last access */
  lastAccessed: number;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Standard position arguments for LSP tools.
 */
export interface PositionArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * Result of position validation.
 */
export type ValidationResult =
  | { valid: true; filePath: string }
  | { valid: false; error: McpResponse };

// =============================================================================
// Dead Code Types
// =============================================================================

/**
 * Arguments for the find_dead_code tool.
 */
export interface FindDeadCodeArgs {
  /** File or directory path to analyze (relative to project root) */
  path?: string;
  /** Count test file references as usage (default: true) */
  include_tests?: boolean;
}

/**
 * A dead (unused) export found during analysis.
 */
export interface DeadExport {
  /** File path relative to project root */
  file: string;
  /** Name of the unused export */
  name: string;
  /** Export kind (function, class, interface, type, variable, etc.) */
  kind: string;
  /** Line number where the export is defined (1-based) */
  line: number;
  /** File that re-exports this symbol (if applicable) */
  exported_from: string | null;
}

/**
 * Internal representation of an export for analysis.
 */
export interface ExportInfo {
  /** Symbol name */
  name: string;
  /** Symbol kind string */
  kind: string;
  /** Absolute file path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Re-export source module, if applicable */
  exportedFrom: string | null;
}

// =============================================================================
// Safe Delete Types
// =============================================================================

/**
 * Arguments for the safe_delete_check tool.
 */
export interface SafeDeleteCheckArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * A reference location with code preview.
 */
export interface ReferenceLocation {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Preview of the line containing the reference */
  preview: string;
}

/**
 * Result of the safe_delete_check tool.
 */
export interface SafeDeleteCheckResult {
  /** True if no external usages exist and the symbol can be safely deleted */
  safe: boolean;
  /** List of blocking references that prevent safe deletion */
  external_references: ReferenceLocation[];
  /** Self-references (recursive calls) that do not block deletion */
  self_references: ReferenceLocation[];
  /** Human-readable explanation of the result */
  reason: string;
  /** The symbol name that was analyzed */
  symbol?: string;
}

// =============================================================================
// Preview Edits Types
// =============================================================================

/**
 * A single proposed edit to validate.
 */
export interface ProposedEdit {
  /** File path (relative to project root or absolute) */
  file: string;
  /** Text to replace (for replacement edits) */
  old_text?: string;
  /** Replacement text (used with old_text) */
  new_text?: string;
  /** Full file content (for full file replacement) */
  content?: string;
}

/**
 * Arguments for validate_edits_preview tool.
 */
export interface ValidateEditsPreviewArgs {
  /** List of proposed edits to validate */
  edits: ProposedEdit[];
}

// =============================================================================
// Breaking Changes Types
// =============================================================================

/**
 * Arguments for the detect_breaking_changes tool.
 */
export interface DetectBreakingChangesArgs {
  /** Git ref to compare from (e.g., HEAD~1, commit hash, branch name) */
  before_ref: string;
  /** Git ref to compare to (default "HEAD") */
  after_ref?: string;
  /** Optional path filter to limit analysis to specific files/directories */
  path?: string;
  /** Timeout in seconds for LLM analysis (default: 120) */
  timeout?: number;
  /** Model to use for analysis */
  model?: 'haiku' | 'sonnet' | 'opus';
}

/**
 * A detected breaking change between two API versions.
 */
export interface BreakingChange {
  /** File path where the breaking change occurred */
  file: string;
  /** Name of the changed symbol */
  symbol: string;
  /** Type of breaking change */
  change_type: string;
  /** Previous signature or definition */
  before: string;
  /** New signature or definition */
  after: string;
  /** Description of the impact on consumers */
  impact: string;
  /** Suggested migration steps */
  migration: string;
}

// =============================================================================
// Semantic Diff Types
// =============================================================================

/**
 * Arguments for the semantic_diff tool.
 */
export interface SemanticDiffArgs {
  /** Git ref to compare from */
  before_ref: string;
  /** Git ref to compare to (default "HEAD") */
  after_ref?: string;
  /** Optional specific file to analyze */
  file?: string;
  /** Timeout in seconds for LLM analysis (default: 120) */
  timeout?: number;
  /** Model to use for analysis */
  model?: 'haiku' | 'sonnet' | 'opus';
}

/**
 * A semantic change with impact analysis.
 */
export interface SemanticChange {
  /** File path */
  file: string;
  /** Human-readable summary of what changed semantically */
  summary: string;
  /** Detailed explanation of the semantic impact */
  semantic_impact: string;
  /** List of files/functions that call or depend on changed code */
  affected_callers: string[];
  /** Risk level of this change */
  risk_level: 'low' | 'medium' | 'high';
}

// =============================================================================
// API Surface Types
// =============================================================================

/**
 * Arguments for the get_api_surface tool.
 */
export interface ApiSurfaceArgs {
  /** Directory to analyze (relative to project root) */
  path?: string;
  /** Entry point files (auto-detect if not provided) */
  entry_points?: string[];
}

/**
 * A public API export with full metadata.
 */
export interface PublicApiExport {
  /** Name of the exported symbol */
  name: string;
  /** Symbol kind (function, class, interface, type, variable, etc.) */
  kind: string;
  /** TypeScript type signature */
  type: string;
  /** File where the symbol is defined */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** JSDoc documentation (if present) */
  jsdoc: string | null;
}
