/**
 * Plugin Manifest (plugin.json) interfaces for Batch Engine
 * @see SPEC-v2 Appendix C.1
 */

// =============================================================================
// Core Plugin Manifest
// =============================================================================

/**
 * Plugin author information
 */
export interface PluginAuthor {
  /** Author name */
  name: string;
  /** Author email */
  email?: string;
  /** Author URL */
  url?: string;
}

/**
 * Complete Plugin Manifest structure
 * Defines the plugin.json schema for Claude Code plugins
 */
export interface PluginManifest {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  /** Plugin unique identifier */
  name: string;

  /** Semantic version (e.g., "2.0.0") */
  version: string;

  /** Human-readable description */
  description: string;

  /** Author information (string or object) */
  author: string | PluginAuthor;

  /** SPDX license identifier */
  license: string;

  /** Homepage URL */
  homepage?: string;

  /** Repository URL */
  repository?: string;

  /** Searchable keywords */
  keywords?: string[];

  // -------------------------------------------------------------------------
  // Compatibility
  // -------------------------------------------------------------------------

  /** Minimum Claude Code version required (semver range) */
  claude_code_version: string;

  /** Node.js version requirement (semver range) */
  node_version?: string;

  /** Supported platforms */
  platforms?: Array<'win32' | 'darwin' | 'linux'>;

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  /** Plugin components organized by type */
  components: PluginComponents;

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Plugin configuration options */
  configuration: PluginConfiguration;

  // -------------------------------------------------------------------------
  // Dependencies
  // -------------------------------------------------------------------------

  /** External dependencies required by the plugin */
  dependencies: PluginDependencies;

  // -------------------------------------------------------------------------
  // Legacy/Compatibility Fields (from existing plugin.json)
  // -------------------------------------------------------------------------

  /** Path to commands directory */
  commands?: string;

  /** Array of agent file paths (legacy format) */
  agents?: string[];

  /** Path to skills directory */
  skills?: string;

  /** Path to hooks configuration */
  hooks?: string;

  /** Path to MCP servers configuration */
  mcpServers?: string;

  /** Path to LSP servers configuration */
  lspServers?: string;
}

// =============================================================================
// Component Collections
// =============================================================================

/**
 * All plugin components organized by type
 */
export interface PluginComponents {
  /** Agent definitions */
  agents: AgentComponent[];

  /** Skill definitions */
  skills: SkillComponent[];

  /** Tool definitions */
  tools: ToolComponent[];

  /** Hook definitions */
  hooks: HookComponent[];

  /** Output style definitions */
  output_styles: OutputStyleComponent[];

  /** Command definitions */
  commands: CommandComponent[];

  /** Template definitions */
  templates?: TemplateComponent[];

  /** MCP server definitions */
  mcp_servers?: McpServerComponent[];
}

/**
 * Helper type to extract the element type from a component array
 */
export type ComponentElement<T extends keyof PluginComponents> =
  PluginComponents[T] extends (infer E)[] ? E : never;

// =============================================================================
// Component Types
// =============================================================================

/**
 * Agent component definition
 */
export interface AgentComponent {
  /** Unique agent name */
  name: string;

  /** Path to agent file (relative to plugin root) */
  file: string;

  /** Human-readable description */
  description: string;

  /** Preferred model for this agent */
  model?: 'sonnet' | 'opus' | 'haiku';

  /** Trigger patterns that activate this agent */
  triggers: string[];

  /** Agent expertise areas */
  expertise?: string[];

  /** Whether agent can spawn subagents */
  can_delegate?: boolean;

  /** Maximum concurrent instances */
  max_instances?: number;
}

/**
 * Skill component definition
 */
export interface SkillComponent {
  /** Unique skill name */
  name: string;

  /** Path to skill file (relative to plugin root) */
  file: string;

  /** Human-readable description */
  description: string;

  /** Skill category */
  category: 'core' | 'stack' | 'common' | 'create' | 'webdev';

  /** Technology stack (for stack-specific skills) */
  stack?: string;

  /** Whether to auto-load on session start */
  auto_load: boolean;

  /** Related skills that often pair with this one */
  related_skills?: string[];

  /** Keywords for search */
  keywords?: string[];
}

/**
 * Tool component definition
 */
export interface ToolComponent {
  /** Unique tool name */
  name: string;

  /** Path to tool file (relative to plugin root) */
  file: string;

  /** Human-readable description */
  description: string;

  /** Path to tool definition (YAML schema) */
  definition: string;

  /** Path to tool implementation */
  implementation: string;

  /** MCP server that provides this tool */
  mcp_server?: string;

  /** Tool input schema (JSON Schema) */
  input_schema?: Record<string, unknown>;

  /** Tool output schema (JSON Schema) */
  output_schema?: Record<string, unknown>;

  /** Whether tool requires confirmation */
  requires_confirmation?: boolean;

  /** Timeout in milliseconds */
  timeout_ms?: number;
}

/**
 * Hook component definition
 */
export interface HookComponent {
  /** Unique hook name */
  name: string;

  /** Path to hook file (relative to plugin root) */
  file: string;

  /** Lifecycle event this hook handles */
  event: HookEvent;

  /** Execution priority (lower = earlier) */
  priority: number;

  /** Whether hook is enabled by default */
  enabled: boolean;

  /** Timeout in milliseconds */
  timeout_ms?: number;

  /** Whether hook runs asynchronously */
  async?: boolean;

  /** Conditions for hook execution */
  conditions?: HookCondition[];
}

/**
 * Supported hook events
 */
export type HookEvent =
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'Notification';

/**
 * Hook execution condition
 */
export interface HookCondition {
  /** Condition type */
  type: 'tool_name' | 'file_pattern' | 'mode' | 'custom';

  /** Condition pattern (regex or string) */
  pattern: string;

  /** Whether to negate the condition */
  negate?: boolean;
}

/**
 * Output style component definition
 */
export interface OutputStyleComponent {
  /** Unique style name */
  name: string;

  /** Path to style configuration file */
  file: string;

  /** Human-readable description */
  description: string;

  /** Mode identifier */
  mode: string;

  /** Style behavior configuration */
  behavior?: {
    show_progress: boolean;
    explain_decisions: boolean;
    ask_on_ambiguity: boolean;
    report_results: 'none' | 'minimal' | 'summary' | 'detailed';
  };
}

/**
 * Command (slash command) component definition
 */
export interface CommandComponent {
  /** Unique command name (without slash) */
  name: string;

  /** Path to command file */
  file: string;

  /** Human-readable description */
  description: string;

  /** Command aliases */
  aliases: string[];

  /** Command arguments specification */
  arguments?: CommandArgument[];

  /** Usage examples */
  examples?: string[];
}

/**
 * Command argument specification
 */
export interface CommandArgument {
  /** Argument name */
  name: string;

  /** Argument description */
  description: string;

  /** Whether argument is required */
  required: boolean;

  /** Argument type */
  type: 'string' | 'number' | 'boolean' | 'array';

  /** Default value */
  default?: unknown;
}

/**
 * Template component definition
 */
export interface TemplateComponent {
  /** Unique template name */
  name: string;

  /** Path to template directory */
  path: string;

  /** Human-readable description */
  description: string;

  /** Template type */
  type: 'minimal' | 'full' | 'custom';

  /** Technologies used in template */
  stack: string[];
}

/**
 * MCP server component definition
 */
export interface McpServerComponent {
  /** Server name */
  name: string;

  /** Server command */
  command: string;

  /** Command arguments */
  args: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Working directory */
  cwd?: string;

  /** Server description */
  description?: string;

  /** Tools provided by this server */
  tools?: string[];
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Plugin configuration options
 */
export interface PluginConfiguration {
  /** Default operating mode */
  default_mode: 'vibecoding' | 'justvibes';

  /** Enable automatic stack detection */
  stack_detection: boolean;

  /** Enable automatic checkpointing */
  auto_checkpoint: boolean;

  /** Enable telemetry collection */
  telemetry: boolean;

  /** Memory configuration */
  memory?: MemoryConfiguration;

  /** Checkpoint configuration */
  checkpoint?: CheckpointConfiguration;

  /** Logging configuration */
  logging?: LoggingConfiguration;
}

/**
 * Memory system configuration
 */
export interface MemoryConfiguration {
  /** Enable memory persistence */
  enabled: boolean;

  /** Memory storage directory */
  directory: string;

  /** Maximum entries per memory type */
  max_entries: number;

  /** Auto-cleanup old entries */
  auto_cleanup: boolean;
}

/**
 * Checkpoint system configuration
 */
export interface CheckpointConfiguration {
  /** Enable checkpointing */
  enabled: boolean;

  /** Maximum checkpoints to retain */
  max_checkpoints: number;

  /** Default checkpoint expiry (hours) */
  expiry_hours: number;

  /** Checkpoint storage directory */
  directory: string;
}

/**
 * Logging configuration
 */
export interface LoggingConfiguration {
  /** Enable logging */
  enabled: boolean;

  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** Log directory */
  directory: string;

  /** Log retention (days) */
  retention_days: number;
}

// =============================================================================
// Dependencies
// =============================================================================

/**
 * Plugin dependencies
 */
export interface PluginDependencies {
  /** Required MCP servers */
  mcp_servers: string[];

  /** Required Node.js packages */
  node_packages: string[];

  /** Required external tools/binaries */
  external_tools: string[];

  /** Required Claude Code features */
  claude_features?: string[];

  /** Optional peer dependencies */
  peer_dependencies?: Record<string, string>;
}

// =============================================================================
// Manifest Manager
// =============================================================================

/**
 * Plugin manifest manager interface
 * Handles loading, validation, and component access
 */
export interface PluginManifestManager {
  /**
   * Load manifest from plugin.json
   * @returns Loaded and parsed manifest
   */
  load(): Promise<PluginManifest>;

  /**
   * Validate the loaded manifest
   * @returns Validation result with errors and warnings
   */
  validate(): Promise<ManifestValidation>;

  /**
   * Get a specific component by type and name
   * @param type - Component type (agents, skills, tools, etc.)
   * @param name - Component name
   * @returns The component if found, undefined otherwise
   */
  getComponent<T extends keyof PluginComponents>(
    type: T,
    name: string
  ): ComponentElement<T> | undefined;

  /**
   * List all components of a given type
   * @param type - Component type
   * @returns Array of component names
   */
  listComponents(type: keyof PluginComponents): string[];

  /**
   * Get all components of a type matching a filter
   * @param type - Component type
   * @param filter - Filter function
   * @returns Filtered components
   */
  filterComponents<T extends keyof PluginComponents>(
    type: T,
    filter: (component: ComponentElement<T>) => boolean
  ): Array<ComponentElement<T>>;

  /**
   * Reload manifest from disk
   */
  reload(): Promise<void>;

  /**
   * Get the manifest file path
   */
  getManifestPath(): string;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Manifest validation result
 */
export interface ManifestValidation {
  /** Whether the manifest is valid */
  valid: boolean;

  /** Critical errors that prevent plugin loading */
  errors: ManifestError[];

  /** Non-critical warnings */
  warnings: ManifestWarning[];

  /** Validation timestamp */
  validated_at: string;

  /** Schema version used for validation */
  schema_version: string;
}

/**
 * Manifest validation error
 */
export interface ManifestError {
  /** JSON path to the error location */
  path: string;

  /** Error message */
  message: string;

  /** Error code for programmatic handling */
  code: ManifestErrorCode;

  /** Expected value (if applicable) */
  expected?: string;

  /** Actual value found */
  actual?: string;
}

/**
 * Manifest error codes
 */
export type ManifestErrorCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'INVALID_PATH'
  | 'FILE_NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'INVALID_VERSION'
  | 'INCOMPATIBLE_VERSION'
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_DEPENDENCY';

/**
 * Manifest validation warning
 */
export interface ManifestWarning {
  /** JSON path to the warning location */
  path: string;

  /** Warning message */
  message: string;

  /** Suggested fix */
  suggestion?: string;

  /** Warning code */
  code?: ManifestWarningCode;
}

/**
 * Manifest warning codes
 */
export type ManifestWarningCode =
  | 'DEPRECATED_FIELD'
  | 'MISSING_OPTIONAL_FIELD'
  | 'UNUSED_COMPONENT'
  | 'PERFORMANCE_CONCERN'
  | 'SECURITY_CONCERN'
  | 'BEST_PRACTICE';

// =============================================================================
// Default Manifest Template
// =============================================================================

/**
 * Default manifest template for new plugins
 * Based on GoodVibes plugin structure
 */
export const DEFAULT_MANIFEST: Partial<PluginManifest> = {
  name: 'goodvibes',
  version: '2.0.0',
  description: 'GoodVibes Plugin - Enterprise-grade batch operations for Claude Code',
  author: {
    name: 'GoodVibes Team',
    email: 'team@goodvibes.sh',
  },
  license: 'MIT',
  homepage: 'https://goodvibes.sh',
  repository: 'https://github.com/mgd34msu/goodvibes.sh',
  keywords: ['fullstack', 'development', 'mcp', 'agents', 'skills', 'batch'],
  claude_code_version: '>=1.0.0',
  node_version: '>=18.0.0',
  platforms: ['win32', 'darwin', 'linux'],
  configuration: {
    default_mode: 'vibecoding',
    stack_detection: true,
    auto_checkpoint: true,
    telemetry: true,
    memory: {
      enabled: true,
      directory: '.goodvibes/memory',
      max_entries: 100,
      auto_cleanup: true,
    },
    checkpoint: {
      enabled: true,
      max_checkpoints: 10,
      expiry_hours: 24,
      directory: '.goodvibes/checkpoints',
    },
    logging: {
      enabled: true,
      level: 'info',
      directory: '.goodvibes/logs',
      retention_days: 30,
    },
  },
  dependencies: {
    mcp_servers: ['goodvibes-tools', 'precision-engine'],
    node_packages: [],
    external_tools: [],
    claude_features: ['subagents', 'mcp', 'hooks'],
  },
};

/**
 * Create a minimal manifest with required fields
 */
export function createMinimalManifest(
  name: string,
  version: string,
  description: string
): PluginManifest {
  return {
    name,
    version,
    description,
    author: 'Unknown',
    license: 'MIT',
    claude_code_version: '>=1.0.0',
    components: {
      agents: [],
      skills: [],
      tools: [],
      hooks: [],
      output_styles: [],
      commands: [],
    },
    configuration: {
      default_mode: 'vibecoding',
      stack_detection: true,
      auto_checkpoint: true,
      telemetry: false,
    },
    dependencies: {
      mcp_servers: [],
      node_packages: [],
      external_tools: [],
    },
  };
}

/**
 * Merge partial manifest with defaults
 */
export function mergeWithDefaults(
  partial: Partial<PluginManifest>
): PluginManifest {
  const defaults = DEFAULT_MANIFEST;

  return {
    name: partial.name ?? defaults.name ?? 'unnamed-plugin',
    version: partial.version ?? defaults.version ?? '0.0.0',
    description: partial.description ?? defaults.description ?? '',
    author: partial.author ?? defaults.author ?? 'Unknown',
    license: partial.license ?? defaults.license ?? 'MIT',
    homepage: partial.homepage ?? defaults.homepage,
    repository: partial.repository ?? defaults.repository,
    keywords: partial.keywords ?? defaults.keywords ?? [],
    claude_code_version: partial.claude_code_version ?? defaults.claude_code_version ?? '>=1.0.0',
    node_version: partial.node_version ?? defaults.node_version,
    platforms: partial.platforms ?? defaults.platforms,
    components: partial.components ?? {
      agents: [],
      skills: [],
      tools: [],
      hooks: [],
      output_styles: [],
      commands: [],
    },
    configuration: {
      ...defaults.configuration,
      ...partial.configuration,
    } as PluginConfiguration,
    dependencies: {
      ...defaults.dependencies,
      ...partial.dependencies,
    } as PluginDependencies,
  };
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if value is a valid PluginManifest
 */
export function isPluginManifest(value: unknown): value is PluginManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const manifest = value as Record<string, unknown>;

  return (
    typeof manifest.name === 'string' &&
    typeof manifest.version === 'string' &&
    typeof manifest.description === 'string' &&
    (typeof manifest.author === 'string' || typeof manifest.author === 'object') &&
    typeof manifest.license === 'string'
  );
}

/**
 * Check if value is a valid AgentComponent
 */
export function isAgentComponent(value: unknown): value is AgentComponent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const component = value as Record<string, unknown>;

  return (
    typeof component.name === 'string' &&
    typeof component.file === 'string' &&
    typeof component.description === 'string' &&
    Array.isArray(component.triggers)
  );
}

/**
 * Check if value is a valid SkillComponent
 */
export function isSkillComponent(value: unknown): value is SkillComponent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const component = value as Record<string, unknown>;

  return (
    typeof component.name === 'string' &&
    typeof component.file === 'string' &&
    typeof component.description === 'string' &&
    typeof component.category === 'string' &&
    typeof component.auto_load === 'boolean'
  );
}

/**
 * Check if value is a valid ToolComponent
 */
export function isToolComponent(value: unknown): value is ToolComponent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const component = value as Record<string, unknown>;

  return (
    typeof component.name === 'string' &&
    typeof component.file === 'string' &&
    typeof component.description === 'string' &&
    typeof component.definition === 'string' &&
    typeof component.implementation === 'string'
  );
}

/**
 * Check if value is a valid HookComponent
 */
export function isHookComponent(value: unknown): value is HookComponent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const component = value as Record<string, unknown>;

  return (
    typeof component.name === 'string' &&
    typeof component.file === 'string' &&
    typeof component.event === 'string' &&
    typeof component.priority === 'number' &&
    typeof component.enabled === 'boolean'
  );
}
