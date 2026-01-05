/**
 * Type definitions for GoodVibes MCP Server
 */

export interface RegistryEntry {
  name: string;
  path: string;
  description: string;
  keywords?: string[];
  category?: string;
}

export interface Registry {
  version: string;
  search_index: RegistryEntry[];
}

export interface SearchResult {
  name: string;
  path: string;
  description: string;
  relevance: number;
}

export interface StackInfo {
  frontend: {
    framework?: string;
    ui_library?: string;
    styling?: string;
    state_management?: string;
  };
  backend: {
    runtime?: string;
    framework?: string;
    database?: string;
    orm?: string;
  };
  build: {
    bundler?: string;
    package_manager?: string;
    typescript: boolean;
  };
  detected_configs: string[];
  recommended_skills: string[];
}

export interface PackageInfo {
  name: string;
  installed: string;
  latest?: string;
  wanted?: string;
  outdated: boolean;
  breaking_changes?: boolean;
}

export interface PluginStatus {
  version: string;
  status: 'healthy' | 'degraded' | 'error';
  issues: string[];
  manifest: { exists: boolean; valid: boolean; version?: string };
  registries: {
    agents: { exists: boolean; count: number };
    skills: { exists: boolean; count: number };
    tools: { exists: boolean; count: number };
  };
  hooks: {
    config_exists: boolean;
    config_valid: boolean;
    events: Array<{ name: string; script: string; exists: boolean }>;
  };
  mcp_server: { running: boolean };
}

export interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Handler Argument Types
// =============================================================================

/** Arguments for search_skills tool */
export interface SearchSkillsArgs {
  query: string;
  category?: string;
  limit?: number;
}

/** Arguments for search_agents and search_tools */
export interface SearchArgs {
  query: string;
  limit?: number;
}

/** Arguments for recommend_skills tool */
export interface RecommendSkillsArgs {
  task: string;
  max_results?: number;
}

/** Arguments for get_skill_content and get_agent_content */
export interface GetContentArgs {
  path: string;
}

/** Arguments for detect_stack tool */
export interface DetectStackArgs {
  path?: string;
  deep?: boolean;
}

/** Arguments for scan_patterns tool */
export interface ScanPatternsArgs {
  path?: string;
  pattern_types?: string[];
}
