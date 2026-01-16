/**
 * Type definitions for GoodVibes MCP Server
 */

// =============================================================================
// Response Types (re-exported from centralized module)
// =============================================================================

// Re-export ToolResponse from the centralized location
export { type ToolResponse, type ToolResponseContent } from './handlers/response-utils.js';

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
// Stack Detection Types (Interface Segregation)
// =============================================================================

/**
 * Frontend-specific stack information.
 * Follows Interface Segregation Principle - read-only data about frontend tech.
 */
export interface FrontendStackInfo {
  framework?: string;
  ui_library?: string;
  styling?: string;
  state_management?: string;
}

/**
 * Backend-specific stack information.
 * Follows Interface Segregation Principle - read-only data about backend tech.
 */
export interface BackendStackInfo {
  runtime?: string;
  framework?: string;
  database?: string;
  orm?: string;
}

/**
 * Build tooling stack information.
 * Follows Interface Segregation Principle - read-only data about build tools.
 */
export interface BuildStackInfo {
  bundler?: string;
  package_manager?: string;
  typescript: boolean;
}

/**
 * Complete stack information combining all domains.
 * Composed from segregated interfaces for flexibility.
 */
export interface StackInfo {
  frontend: FrontendStackInfo;
  backend: BackendStackInfo;
  build: BuildStackInfo;
  detected_configs: string[];
  recommended_skills: string[];
}

// =============================================================================
// Package Types
// =============================================================================

/**
 * Read-only package version information.
 */
export interface PackageVersionInfo {
  name: string;
  installed: string;
  latest?: string;
  wanted?: string;
}

/**
 * Package status with update information.
 * Extends read-only version info with mutation-relevant flags.
 */
export interface PackageInfo extends PackageVersionInfo {
  outdated: boolean;
  breaking_changes?: boolean;
}

// =============================================================================
// Plugin Status Types (Interface Segregation)
// =============================================================================

/**
 * Manifest validation status - read-only.
 */
export interface ManifestStatus {
  exists: boolean;
  valid: boolean;
  version?: string;
}

/**
 * Registry status - read-only.
 */
export interface RegistryStatus {
  exists: boolean;
  count: number;
}

/**
 * All registries status - read-only.
 */
export interface RegistriesStatus {
  agents: RegistryStatus;
  skills: RegistryStatus;
  tools: RegistryStatus;
}

/**
 * Hook event status - read-only.
 */
export interface HookEventStatus {
  name: string;
  script: string;
  exists: boolean;
}

/**
 * Hooks configuration status - read-only.
 */
export interface HooksStatus {
  config_exists: boolean;
  config_valid: boolean;
  events: HookEventStatus[];
}

/**
 * MCP server status - read-only.
 */
export interface McpServerStatus {
  running: boolean;
}

/**
 * Complete plugin health status.
 * Composed from segregated status interfaces.
 */
export interface PluginStatus {
  version: string;
  status: 'healthy' | 'degraded' | 'error';
  issues: string[];
  manifest: ManifestStatus;
  registries: RegistriesStatus;
  hooks: HooksStatus;
  mcp_server: McpServerStatus;
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
