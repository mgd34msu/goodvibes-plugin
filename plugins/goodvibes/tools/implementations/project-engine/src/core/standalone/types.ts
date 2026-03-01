/**
 * Standalone Domain Types
 *
 * Shared types for the standalone domain (bundle analyzer, scaffold).
 *
 * @module core/standalone/types
 */

// =============================================================================
// Bundle Analyzer Types
// =============================================================================

/**
 * Output format for bundle analysis.
 * - 'summary': Top 5 chunks, condensed output
 * - 'detailed': All chunks, full output
 */
export type BundleFormat = 'summary' | 'detailed';

/**
 * Arguments for the analyze_bundle MCP tool.
 */
export interface AnalyzeBundleArgs {
  /** Build output directory path (relative to project root) */
  path?: string;
  /** Output format - summary or detailed */
  format?: BundleFormat;
}

/**
 * Size information for a bundle file or chunk.
 */
export interface SizeInfo {
  /** Raw uncompressed byte count */
  raw: number;
  /** Estimated gzip-compressed byte count */
  gzip: number;
  /** Human-readable formatted string (e.g. "1.23 MB (450.0 KB gzipped)") */
  formatted: string;
}

/**
 * Information about a single build chunk.
 */
export interface ChunkInfo {
  /** Relative file name within the build directory */
  name: string;
  /** Raw byte size of the chunk */
  size: number;
  /** Estimated gzip size of the chunk */
  gzip_size: number;
  /** Number of detected modules inside the chunk */
  modules: number;
}

/**
 * Information about a large module detected inside a bundle.
 */
export interface ModuleInfo {
  /** Module specifier or package name */
  name: string;
  /** Estimated byte size (0 if unknown) */
  size: number;
  /** Package name the module belongs to */
  from_package: string;
}

/**
 * Information about a package with multiple versions (potential duplicate).
 */
export interface DuplicateInfo {
  /** Package name */
  package: string;
  /** All resolved versions found in the dependency tree */
  versions: string[];
  /** Estimated total size across all versions (0 if unknown) */
  total_size: number;
}

/**
 * Complete bundle analysis result returned by the analyze_bundle tool.
 */
export interface BundleAnalysis {
  /** Aggregate size across all chunks */
  total_size: SizeInfo;
  /** Individual chunk details (limited to 5 in summary mode) */
  chunks: ChunkInfo[];
  /** Top 10 largest detected modules, sorted by size descending */
  largest_modules: ModuleInfo[];
  /** Packages detected with multiple versions (top 10) */
  duplicates: DuplicateInfo[];
  /** Actionable recommendations (up to 10) */
  recommendations: string[];
  /** Relative path to the build directory that was scanned */
  build_directory?: string;
  /** Total number of bundle files analyzed */
  files_analyzed?: number;
}

// =============================================================================
// Scaffold Types
// =============================================================================

/**
 * Arguments for the scaffold_project MCP tool.
 */
export interface ScaffoldProjectArgs {
  /** Template name to use (e.g., 'next-saas', 'react-component') */
  template: string;
  /** Output directory for the scaffolded project (relative to project root) */
  output_dir: string;
  /** Variables to substitute in template files using {{key}} syntax */
  variables?: Record<string, string>;
  /** Whether to run npm/pnpm/yarn install after scaffolding (default: true) */
  run_install?: boolean;
  /** Whether to initialize a git repository (default: true) */
  run_git_init?: boolean;
}
