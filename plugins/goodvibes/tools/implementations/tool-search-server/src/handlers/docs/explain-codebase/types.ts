/**
 * Types for Explain Codebase Handler
 *
 * Contains all TypeScript interfaces and type definitions used by the
 * explain-codebase module for analyzing and documenting codebases.
 *
 * @module handlers/docs/explain-codebase/types
 */

// =============================================================================
// Public Types (exported from module)
// =============================================================================

/**
 * Arguments for the explain_codebase MCP tool
 */
export interface ExplainCodebaseArgs {
  /** Directory to analyze (defaults to PROJECT_ROOT) */
  path?: string;
  /** Analysis depth: shallow (fast), medium (default), deep (thorough) */
  depth?: 'shallow' | 'medium' | 'deep';
  /** Specific areas to focus on (e.g., ["auth", "api", "database"]) */
  focus?: string[];
  /** Regenerate even if cached (default: false) */
  refresh?: boolean;
  /** Generate architecture diagram (default: true) */
  include_architecture?: boolean;
}

/**
 * Key file detected in the codebase
 */
export interface KeyFile {
  path: string;
  purpose: string;
  importance: 'critical' | 'high' | 'medium';
}

/**
 * Architecture information
 */
export interface Architecture {
  type: string;
  description: string;
  layers?: string[];
  diagram_ascii?: string;
}

/**
 * Result from explain_codebase tool
 */
export interface ExplainCodebaseResult {
  summary: string;
  tech_stack: string[];
  architecture: Architecture;
  key_files: KeyFile[];
  entry_points: string[];
  main_features: string[];
  dependencies_summary: string;
  patterns_used: string[];
  conventions: string[];
  concerns?: string[];
  cached: boolean;
  generated_at: string;
}

// =============================================================================
// Internal Types (used within module)
// =============================================================================

/**
 * Cached explanation data
 */
export interface CachedExplanation extends ExplainCodebaseResult {
  cache_version: number;
  project_hash: string;
}

/**
 * Gathered codebase information before LLM analysis
 */
export interface CodebaseInfo {
  packageJson: PackageJsonData | null;
  stack: StackData;
  apiRoutes: ApiRoutesData;
  conventions: ConventionsData;
  structure: string;
  keyFiles: KeyFile[];
  entryPoints: string[];
}

/**
 * Package.json data structure
 */
export interface PackageJsonData {
  name?: string;
  description?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Stack detection result
 */
export interface StackData {
  frontend?: {
    framework?: string;
    ui_library?: string;
    styling?: string;
    state_management?: string;
  };
  backend?: {
    runtime?: string;
    framework?: string;
    orm?: string;
    database?: string;
  };
  build?: {
    bundler?: string;
    package_manager?: string;
    typescript?: boolean;
  };
  detected_configs?: string[];
  recommended_skills?: string[];
}

/**
 * API routes result
 */
export interface ApiRoutesData {
  routes?: Array<{
    method: string;
    path: string;
    handler?: string;
  }>;
  framework?: string;
}

/**
 * Conventions result
 */
export interface ConventionsData {
  naming?: {
    files?: string;
    variables?: string;
    functions?: string;
  };
  imports?: {
    order?: string[];
    style?: string;
  };
  structure?: {
    directory_layout?: string[];
  };
}
