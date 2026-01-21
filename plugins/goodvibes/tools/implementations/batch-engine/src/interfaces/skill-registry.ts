/**
 * Skill Registry interfaces for Batch Engine
 * @see SPEC-v2 Section 14.1
 *
 * Provides type definitions for:
 * - Skill definitions and metadata
 * - Registry structure (matching _registry.yaml)
 * - Registry manager for loading, querying, and validation
 * - Skill loader for runtime management
 * - Auto-load configuration
 */

// =============================================================================
// Registry File Paths
// =============================================================================

/**
 * Standard paths for skill registry files
 * All paths are relative to the plugin root
 */
export const SKILL_REGISTRY_PATHS = {
  /** Main registry YAML file */
  registry: 'skills/_registry.yaml',
  /** Core skills directory */
  core: 'skills/core',
  /** Stack-specific skills directory */
  stacks: 'skills/stacks',
  /** Common skills directory */
  common: 'skills/common',
  /** Create skills directory */
  create: 'skills/create',
} as const;

/**
 * Type for registry path keys
 */
export type SkillRegistryPathKey = keyof typeof SKILL_REGISTRY_PATHS;

// =============================================================================
// Skill Categories
// =============================================================================

/**
 * Skill category type
 * - core: Always available, fundamental skills
 * - stack: Technology-specific skills (React, Python, etc.)
 * - common: Shared utilities and patterns
 * - create: Project scaffolding and generation
 */
export type SkillCategory = 'core' | 'stack' | 'common' | 'create';

/**
 * Skill status indicating availability
 */
export type SkillStatus = 'active' | 'disabled' | 'deprecated' | 'experimental';

// =============================================================================
// Skill Definition
// =============================================================================

/**
 * Complete skill definition as stored in the registry
 * Represents a single skill's metadata and configuration
 */
export interface SkillDefinition {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique skill name (e.g., "typescript", "react", "prisma") */
  name: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Human-readable description */
  description: string;

  /** Skill category */
  category: SkillCategory;

  /** Technology stack (only for 'stack' category skills) */
  stack?: string;

  /** Skill status */
  status?: SkillStatus;

  // ---------------------------------------------------------------------------
  // Loading Configuration
  // ---------------------------------------------------------------------------

  /** Auto-load on startup when conditions are met */
  auto_load: boolean;

  /**
   * Expression to evaluate for conditional loading
   * Examples:
   * - "stack.frameworks.includes('react')"
   * - "files.exists('prisma/schema.prisma')"
   * - "env.NODE_ENV === 'development'"
   */
  load_condition?: string;

  /** Priority for load order (lower = earlier) */
  load_priority?: number;

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  /** Skills that must be loaded before this one */
  depends_on?: string[];

  /** Skills that cannot be loaded alongside this one */
  conflicts_with?: string[];

  /** Skills that are recommended but not required */
  suggests?: string[];

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  /** Relative path to skill file from plugin root */
  file: string;

  /** SHA-256 checksum for integrity verification */
  checksum?: string;

  /** Last update timestamp (ISO 8601) */
  updated_at?: string;

  /** Author information */
  author?: string;

  /** Keywords for search */
  keywords?: string[];

  /** Related skills that often pair with this one */
  related_skills?: string[];
}

// =============================================================================
// Registry Structure
// =============================================================================

/**
 * Complete skill registry structure
 * Matches the _registry.yaml file format
 */
export interface SkillRegistry {
  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  /** Registry schema version */
  version: string;

  /** Generation timestamp (ISO 8601) */
  generated_at: string;

  /** Total skill count */
  total_skills: number;

  // ---------------------------------------------------------------------------
  // Skills by Category
  // ---------------------------------------------------------------------------

  /** Core skills (always available) */
  core: SkillDefinition[];

  /** Stack-specific skills organized by stack name */
  stacks: {
    [stack: string]: SkillDefinition[];
  };

  /** Common utility skills */
  common?: SkillDefinition[];

  /** Project creation skills */
  create?: SkillDefinition[];

  // ---------------------------------------------------------------------------
  // Indexes for Fast Lookup
  // ---------------------------------------------------------------------------

  /** Index by skill name for O(1) lookup */
  index: {
    [name: string]: SkillDefinition;
  };

  /** Index by category */
  by_category: {
    [category in SkillCategory]?: string[];
  };

  /** Index by stack */
  by_stack: {
    [stack: string]: string[];
  };
}

// =============================================================================
// Registry Manager
// =============================================================================

/**
 * Skill registry manager interface
 * Handles loading, querying, generation, and validation of the skill registry
 */
export interface SkillRegistryManager {
  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /**
   * Load the registry from _registry.yaml
   * @returns Loaded and parsed registry
   * @throws Error if registry file is missing or invalid
   */
  load(): Promise<SkillRegistry>;

  /**
   * Reload the registry from disk (discards cached data)
   * @returns Fresh registry instance
   */
  reload(): Promise<SkillRegistry>;

  /**
   * Check if registry is loaded
   * @returns true if registry is loaded in memory
   */
  isLoaded(): boolean;

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a new registry by scanning skill directories
   * @returns Newly generated registry
   */
  generate(): Promise<SkillRegistry>;

  /**
   * Save registry to _registry.yaml
   * @param registry - Registry to save
   */
  save(registry: SkillRegistry): Promise<void>;

  /**
   * Regenerate and save the registry
   * @returns Updated registry
   */
  regenerate(): Promise<SkillRegistry>;

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Get a skill by name
   * @param name - Skill name
   * @returns Skill definition or undefined if not found
   */
  getSkill(name: string): SkillDefinition | undefined;

  /**
   * List all skills, optionally filtered by category
   * @param category - Optional category filter
   * @returns Array of skill definitions
   */
  listSkills(category?: SkillCategory): SkillDefinition[];

  /**
   * List skills for a specific technology stack
   * @param stack - Stack name (e.g., "react", "python")
   * @returns Array of skill definitions for that stack
   */
  listStackSkills(stack: string): SkillDefinition[];

  /**
   * Search skills by keyword
   * @param query - Search query
   * @returns Matching skill definitions
   */
  searchSkills(query: string): SkillDefinition[];

  // ---------------------------------------------------------------------------
  // Loading Control
  // ---------------------------------------------------------------------------

  /**
   * Get all skills that should be auto-loaded
   * @returns Skills with auto_load: true
   */
  getAutoLoadSkills(): SkillDefinition[];

  /**
   * Get skills appropriate for a detected stack
   * @param stack - Detected technology stack
   * @returns Skills matching the stack
   */
  getSkillsForStack(stack: string): SkillDefinition[];

  /**
   * Get skills for multiple stacks
   * @param stacks - Array of stack names
   * @returns Skills matching any of the stacks
   */
  getSkillsForStacks(stacks: string[]): SkillDefinition[];

  /**
   * Evaluate a skill's load condition against context
   * @param skill - Skill definition with load_condition
   * @param context - Context object for condition evaluation
   * @returns true if skill should be loaded
   */
  evaluateLoadCondition(skill: SkillDefinition, context: LoadConditionContext): boolean;

  /**
   * Resolve load order considering dependencies
   * @param skills - Skills to order
   * @returns Skills in correct load order
   */
  resolveLoadOrder(skills: SkillDefinition[]): SkillDefinition[];

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate the entire registry
   * @returns Validation result with errors and warnings
   */
  validate(): Promise<RegistryValidation>;

  /**
   * Check dependencies for a specific skill
   * @param skill - Skill to check
   * @returns Dependency check result
   */
  checkDependencies(skill: SkillDefinition): DependencyCheck;

  /**
   * Verify skill file checksums
   * @returns Array of skills with checksum mismatches
   */
  verifyChecksums(): Promise<ChecksumVerification[]>;
}

/**
 * Context object for evaluating load conditions
 */
export interface LoadConditionContext {
  /** Detected technology stack */
  stack: {
    languages: string[];
    frameworks: string[];
    libraries: string[];
    tools: string[];
  };
  /** File existence checks */
  files: {
    exists: (path: string) => boolean;
    pattern: (glob: string) => string[];
  };
  /** Environment variables */
  env: Record<string, string | undefined>;
  /** Current operating mode */
  mode: 'vibecoding' | 'justvibes';
  /** Project root path */
  project_root: string;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Registry validation result
 */
export interface RegistryValidation {
  /** Overall validity (true if no errors) */
  valid: boolean;

  /** Critical errors that prevent registry use */
  errors: RegistryError[];

  /** Non-critical warnings */
  warnings: RegistryWarning[];

  /** Skill files found on disk but not in registry */
  orphaned_files: string[];

  /** Skills in registry but files missing from disk */
  missing_files: string[];

  /** Duplicate skill names found */
  duplicates: string[];

  /** Validation timestamp */
  validated_at: string;
}

/**
 * Registry validation error
 */
export interface RegistryError {
  /** Skill name (or 'registry' for global errors) */
  skill: string;

  /** Error message */
  error: string;

  /** Error code for programmatic handling */
  code: RegistryErrorCode;

  /** Additional context */
  details?: Record<string, unknown>;
}

/**
 * Registry error codes
 */
export type RegistryErrorCode =
  | 'MISSING_FILE'
  | 'INVALID_YAML'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_CATEGORY'
  | 'INVALID_VERSION'
  | 'CHECKSUM_MISMATCH'
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_DEPENDENCY'
  | 'DUPLICATE_NAME'
  | 'INVALID_LOAD_CONDITION';

/**
 * Registry validation warning
 */
export interface RegistryWarning {
  /** Skill name (or 'registry' for global warnings) */
  skill: string;

  /** Warning message */
  warning: string;

  /** Warning code */
  code?: RegistryWarningCode;

  /** Suggested fix */
  suggestion?: string;
}

/**
 * Registry warning codes
 */
export type RegistryWarningCode =
  | 'MISSING_CHECKSUM'
  | 'OUTDATED_TIMESTAMP'
  | 'DEPRECATED_SKILL'
  | 'MISSING_DESCRIPTION'
  | 'NO_KEYWORDS'
  | 'ORPHANED_FILE'
  | 'UNUSED_DEPENDENCY';

/**
 * Dependency check result for a single skill
 */
export interface DependencyCheck {
  /** All dependencies satisfied */
  satisfied: boolean;

  /** Missing required dependencies */
  missing: string[];

  /** Active conflicts with loaded skills */
  conflicts: string[];

  /** Optional suggestions not loaded */
  missing_suggestions?: string[];
}

/**
 * Checksum verification result
 */
export interface ChecksumVerification {
  /** Skill name */
  skill: string;

  /** File path */
  file: string;

  /** Expected checksum from registry */
  expected: string;

  /** Actual checksum computed from file */
  actual: string;

  /** Whether checksums match */
  valid: boolean;
}

// =============================================================================
// Skill Loader
// =============================================================================

/**
 * Skill loader interface for runtime skill management
 */
export interface SkillLoader {
  /**
   * Load a skill into memory
   * @param definition - Skill definition to load
   * @returns Loaded skill instance
   */
  loadSkill(definition: SkillDefinition): Promise<LoadedSkill>;

  /**
   * Load multiple skills respecting dependencies
   * @param definitions - Skills to load
   * @returns Array of loaded skills
   */
  loadSkills(definitions: SkillDefinition[]): Promise<LoadedSkill[]>;

  /**
   * Unload a skill from memory
   * @param name - Skill name to unload
   */
  unloadSkill(name: string): void;

  /**
   * Unload all skills
   */
  unloadAll(): void;

  /**
   * Get all currently loaded skills
   * @returns Array of loaded skills
   */
  getLoadedSkills(): LoadedSkill[];

  /**
   * Check if a skill is currently loaded
   * @param name - Skill name
   * @returns true if skill is loaded
   */
  isLoaded(name: string): boolean;

  /**
   * Get a loaded skill by name
   * @param name - Skill name
   * @returns Loaded skill or undefined
   */
  getLoaded(name: string): LoadedSkill | undefined;

  /**
   * Reload a skill (unload then load)
   * @param name - Skill name to reload
   * @returns Reloaded skill
   */
  reloadSkill(name: string): Promise<LoadedSkill>;
}

/**
 * A skill that has been loaded into memory
 */
export interface LoadedSkill {
  /** Original skill definition */
  definition: SkillDefinition;

  /** Skill file content */
  content: string;

  /** When the skill was loaded (ISO 8601) */
  loaded_at: string;

  /** Current skill status */
  status: LoadedSkillStatus;

  /** Error message if status is 'error' */
  error?: string;

  /** File size in bytes */
  size_bytes: number;

  /** Time taken to load in milliseconds */
  load_time_ms: number;
}

/**
 * Loaded skill status
 */
export type LoadedSkillStatus = 'active' | 'disabled' | 'error';

// =============================================================================
// Auto-Load Configuration
// =============================================================================

/**
 * Configuration for automatic skill loading
 */
export interface AutoLoadConfig {
  /** Always load core skills on startup */
  load_core: boolean;

  /** Detect stack and load matching skills */
  detect_stack: boolean;

  /** Explicit skills to always load (by name) */
  explicit: string[];

  /** Skills to exclude from auto-loading (by name) */
  exclude: string[];

  /** Load common utility skills */
  load_common: boolean;

  /** Maximum skills to auto-load (0 = unlimited) */
  max_auto_load: number;

  /** Timeout for auto-load operations (ms) */
  timeout_ms: number;
}

/**
 * Default auto-load configuration
 */
export const DEFAULT_AUTO_LOAD_CONFIG: AutoLoadConfig = {
  load_core: true,
  detect_stack: true,
  explicit: [],
  exclude: [],
  load_common: true,
  max_auto_load: 0,
  timeout_ms: 5000,
};

// =============================================================================
// Registry Events
// =============================================================================

/**
 * Events emitted by the skill registry system
 */
export type SkillRegistryEvent =
  | { type: 'registry_loaded'; registry: SkillRegistry }
  | { type: 'registry_reloaded'; registry: SkillRegistry }
  | { type: 'registry_generated'; registry: SkillRegistry }
  | { type: 'skill_loaded'; skill: LoadedSkill }
  | { type: 'skill_unloaded'; name: string }
  | { type: 'skill_error'; name: string; error: string }
  | { type: 'validation_completed'; result: RegistryValidation };

/**
 * Event handler type for registry events
 */
export type SkillRegistryEventHandler = (event: SkillRegistryEvent) => void;

// =============================================================================
// Registry YAML Structure
// =============================================================================

/**
 * Raw YAML structure for _registry.yaml file
 * This represents the file format before parsing into SkillRegistry
 */
export interface SkillRegistryYaml {
  /** Schema version */
  version: string;

  /** Generation metadata */
  metadata: {
    generated_at: string;
    generator: string;
    total_skills: number;
  };

  /** Core skills list */
  core: SkillDefinitionYaml[];

  /** Stack skills by stack name */
  stacks: {
    [stack: string]: SkillDefinitionYaml[];
  };

  /** Common skills list */
  common?: SkillDefinitionYaml[];

  /** Create skills list */
  create?: SkillDefinitionYaml[];
}

/**
 * Skill definition as stored in YAML (snake_case)
 */
export interface SkillDefinitionYaml {
  name: string;
  version: string;
  description: string;
  category: SkillCategory;
  stack?: string;
  status?: SkillStatus;
  auto_load: boolean;
  load_condition?: string;
  load_priority?: number;
  depends_on?: string[];
  conflicts_with?: string[];
  suggests?: string[];
  file: string;
  checksum?: string;
  updated_at?: string;
  author?: string;
  keywords?: string[];
  related_skills?: string[];
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if value is a valid SkillDefinition
 */
export function isSkillDefinition(value: unknown): value is SkillDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const skill = value as Record<string, unknown>;

  return (
    typeof skill.name === 'string' &&
    typeof skill.version === 'string' &&
    typeof skill.description === 'string' &&
    typeof skill.category === 'string' &&
    ['core', 'stack', 'common', 'create'].includes(skill.category as string) &&
    typeof skill.auto_load === 'boolean' &&
    typeof skill.file === 'string'
  );
}

/**
 * Check if value is a valid SkillRegistry
 */
export function isSkillRegistry(value: unknown): value is SkillRegistry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const registry = value as Record<string, unknown>;

  return (
    typeof registry.version === 'string' &&
    typeof registry.generated_at === 'string' &&
    Array.isArray(registry.core) &&
    typeof registry.stacks === 'object' &&
    typeof registry.index === 'object'
  );
}

/**
 * Check if value is a valid LoadedSkill
 */
export function isLoadedSkill(value: unknown): value is LoadedSkill {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const loaded = value as Record<string, unknown>;

  return (
    isSkillDefinition(loaded.definition) &&
    typeof loaded.content === 'string' &&
    typeof loaded.loaded_at === 'string' &&
    typeof loaded.status === 'string' &&
    ['active', 'disabled', 'error'].includes(loaded.status as string)
  );
}

/**
 * Check if value is a valid AutoLoadConfig
 */
export function isAutoLoadConfig(value: unknown): value is AutoLoadConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const config = value as Record<string, unknown>;

  return (
    typeof config.load_core === 'boolean' &&
    typeof config.detect_stack === 'boolean' &&
    Array.isArray(config.explicit) &&
    Array.isArray(config.exclude)
  );
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a minimal skill definition with required fields
 * @param name - Skill name
 * @param file - Path to skill file
 * @param category - Skill category
 * @returns Minimal skill definition
 */
export function createSkillDefinition(
  name: string,
  file: string,
  category: SkillCategory = 'core'
): SkillDefinition {
  return {
    name,
    version: '1.0.0',
    description: `${name} skill`,
    category,
    auto_load: category === 'core',
    file,
  };
}

/**
 * Create an empty skill registry
 * @returns Empty registry structure
 */
export function createEmptyRegistry(): SkillRegistry {
  return {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    total_skills: 0,
    core: [],
    stacks: {},
    common: [],
    create: [],
    index: {},
    by_category: {},
    by_stack: {},
  };
}

/**
 * Create a default auto-load config
 * @param overrides - Optional config overrides
 * @returns Auto-load configuration
 */
export function createAutoLoadConfig(
  overrides?: Partial<AutoLoadConfig>
): AutoLoadConfig {
  return {
    ...DEFAULT_AUTO_LOAD_CONFIG,
    ...overrides,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all skill names from a registry
 * @param registry - Skill registry
 * @returns Array of skill names
 */
export function getAllSkillNames(registry: SkillRegistry): string[] {
  return Object.keys(registry.index);
}

/**
 * Get skills by status
 * @param registry - Skill registry
 * @param status - Status to filter by
 * @returns Skills with matching status
 */
export function getSkillsByStatus(
  registry: SkillRegistry,
  status: SkillStatus
): SkillDefinition[] {
  return Object.values(registry.index).filter(
    (skill) => skill.status === status || (status === 'active' && !skill.status)
  );
}

/**
 * Count skills by category
 * @param registry - Skill registry
 * @returns Map of category to count
 */
export function countByCategory(registry: SkillRegistry): Record<SkillCategory, number> {
  const counts: Record<SkillCategory, number> = {
    core: 0,
    stack: 0,
    common: 0,
    create: 0,
  };

  for (const skill of Object.values(registry.index)) {
    counts[skill.category]++;
  }

  return counts;
}
