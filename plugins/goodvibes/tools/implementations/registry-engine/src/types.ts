/**
 * Type definitions for Registry Engine MCP Server
 */

// =============================================================================
// Registry Types
// =============================================================================

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

/** Arguments for skill_dependencies tool */
export interface SkillDependenciesArgs {
  skill: string;
  depth?: number;
  include_optional?: boolean;
}

// =============================================================================
// Handler Context Types
// =============================================================================

/**
 * Context passed to all tool handlers.
 * Contains lazy-loaded registry indexes.
 */
export interface HandlerContext {
  skillsIndex: Fuse.Fuse<RegistryEntry> | null;
  agentsIndex: Fuse.Fuse<RegistryEntry> | null;
  toolsIndex: Fuse.Fuse<RegistryEntry> | null;
  skillsRegistry: Registry | null;
}

// =============================================================================
// Response Types
// =============================================================================

export interface ToolResponseContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolResponse {
  content: ToolResponseContent[];
  isError?: boolean;
}
