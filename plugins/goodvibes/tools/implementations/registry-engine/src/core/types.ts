/**
 * Domain types for registry-engine core layer (L1).
 * These are the canonical entity and argument types for the registry domain.
 */

import type Fuse from 'fuse.js';

// =============================================================================
// Registry Entities
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
// Tool Argument Types
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
export interface ContentArgs {
  path: string;
}

/** Arguments for skill_dependencies tool */
export interface DependencyAnalysisArgs {
  skill: string;
  depth?: number;
  include_optional?: boolean;
}

// =============================================================================
// Handler Context
// =============================================================================

/**
 * Context passed to all tool handlers.
 * Contains lazy-loaded registry indexes.
 */
export interface RegistryContext {
  skillsIndex: Fuse<RegistryEntry> | null;
  agentsIndex: Fuse<RegistryEntry> | null;
  toolsIndex: Fuse<RegistryEntry> | null;
  skillsRegistry: Registry | null;
}

// =============================================================================
// Dependency Types
// =============================================================================

/** Information about a dependency relationship */
export interface DependencyLink {
  skill: string;
  path: string;
  reason: string;
}

/** Information about a skill that depends on the target */
export interface DependentRef {
  skill: string;
  path: string;
}

// =============================================================================
// Metadata Type
// =============================================================================

/** Parsed metadata from a skill file's frontmatter or content */
export interface SkillMetadata {
  requires?: string[];
  complements?: string[];
  conflicts?: string[];
  category?: string;
  technologies?: string[];
  difficulty?: string;
}
