/**
 * Plugin Directory Structure interfaces for Batch Engine
 * @see SPEC-v2 Section 14.1
 */

/**
 * Core plugin directory structure constants
 * Defines the canonical layout of the goodvibes plugin
 */
export const PLUGIN_STRUCTURE = {
  root: 'plugins/goodvibes',
  directories: {
    claude_plugin: '.claude-plugin',
    agents: 'agents',
    skills: 'skills',
    tools: 'tools',
    hooks: 'hooks',
    output_styles: 'output-styles',
    commands: 'commands',
    templates: 'templates'
  },
  files: {
    plugin_manifest: '.claude-plugin/plugin.json',
    mcp_config: '.mcp.json',
    lsp_config: '.lsp.json',
    hooks_config: 'hooks.json'
  }
} as const;

/**
 * Skills subdirectory structure
 * Core skills are always loaded; stack-specific skills auto-load based on detection
 * @see SPEC-v2 Section 14.1 - skills/ section
 */
export const SKILLS_STRUCTURE = {
  core: 'skills/core',
  stacks: {
    react: 'skills/stacks/react',
    node: 'skills/stacks/node',
    python: 'skills/stacks/python'
  },
  registry: 'skills/_registry.yaml'
} as const;

/**
 * Tools subdirectory structure
 * Separates tool definitions (YAML) from implementations (TypeScript/MCP)
 * @see SPEC-v2 Section 14.1 - tools/ section
 */
export const TOOLS_STRUCTURE = {
  definitions: 'tools/definitions',
  implementations: 'tools/implementations',
  registry: 'tools/_registry.yaml'
} as const;

/**
 * Agents structure with the 6 consolidated agent types
 * @see SPEC-v2 Section 14.1 - agents/ section
 */
export const AGENTS_STRUCTURE = {
  directory: 'agents',
  registry: 'agents/_registry.yaml',
  agents: ['engineer', 'reviewer', 'tester', 'architect', 'deployer', 'integrator']
} as const;

/**
 * Hooks subdirectory structure
 * Contains hook registration and script implementations
 * @see SPEC-v2 Section 14.1 - hooks/ section
 */
export const HOOKS_STRUCTURE = {
  directory: 'hooks',
  config: 'hooks/hooks.json',
  scripts: 'hooks/scripts',
  scripts_src: 'hooks/scripts/src'
} as const;

/**
 * Output styles structure
 * Defines communication modes for agent output
 * @see SPEC-v2 Section 14.1 - output-styles/ section
 */
export const OUTPUT_STYLES_STRUCTURE = {
  directory: 'output-styles',
  styles: ['vibecoding', 'justvibes']
} as const;

/**
 * Commands structure for slash commands
 * @see SPEC-v2 Section 14.1 - commands/ section
 */
export const COMMANDS_STRUCTURE = {
  directory: 'commands',
  commands: ['batch', 'status', 'recover', 'mode']
} as const;

/**
 * Templates structure for prompt templates
 * @see SPEC-v2 Section 14.1 - templates/ section
 */
export const TEMPLATES_STRUCTURE = {
  directory: 'templates',
  templates: ['agent-prompt.hbs', 'error-report.hbs', 'batch-summary.hbs']
} as const;

/**
 * Plugin directory manager interface
 * Provides methods for verifying, creating, and discovering plugin components
 */
export interface PluginDirectoryManager {
  /** Verify the plugin directory structure is valid */
  verifyStructure(): Promise<StructureVerification>;

  /** Ensure all required directories exist */
  ensureDirectories(): Promise<void>;

  /** List all registered agents */
  listAgents(): Promise<string[]>;

  /** List all registered skills */
  listSkills(): Promise<string[]>;

  /** List all registered tools */
  listTools(): Promise<string[]>;

  /** List all registered hooks */
  listHooks(): Promise<string[]>;

  /** List all available output styles */
  listOutputStyles(): Promise<string[]>;

  /** List all available commands */
  listCommands(): Promise<string[]>;

  /** List all available templates */
  listTemplates(): Promise<string[]>;

  /** Get the absolute path to an agent file */
  getAgentPath(name: string): string;

  /** Get the absolute path to a skill directory */
  getSkillPath(name: string): string;

  /** Get the absolute path to a tool definition or implementation */
  getToolPath(name: string): string;

  /** Get the absolute path to a template file */
  getTemplatePath(name: string): string;
}

/**
 * Result of structure verification
 * Reports on the validity and completeness of the plugin structure
 */
export interface StructureVerification {
  /** Whether the structure is valid */
  valid: boolean;
  /** List of directories that should exist but don't */
  missing_directories: string[];
  /** List of required files that are missing */
  missing_files: string[];
  /** List of unexpected files that may indicate issues */
  extra_files: string[];
  /** Non-critical warnings about the structure */
  warnings: string[];
}

/**
 * Registry entry for any plugin component
 * Common structure for agents, skills, tools, hooks, etc.
 */
export interface RegistryEntry {
  /** Unique name identifier */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Relative path from plugin root */
  path: string;
  /** Whether this component is enabled */
  enabled: boolean;
}

/**
 * Consolidated plugin registry
 * Contains all registered components across all categories
 */
export interface PluginRegistry {
  /** Registered agent definitions */
  agents: RegistryEntry[];
  /** Registered skill definitions */
  skills: RegistryEntry[];
  /** Registered tool definitions */
  tools: RegistryEntry[];
  /** Registered hook definitions */
  hooks: RegistryEntry[];
  /** Registered output style definitions */
  output_styles: RegistryEntry[];
  /** Registered command definitions */
  commands: RegistryEntry[];
}

/**
 * Plugin loader interface
 * Provides methods to load individual plugin components
 */
export interface PluginLoader {
  /** Load the full plugin registry from all _registry.yaml files */
  loadRegistry(): Promise<PluginRegistry>;

  /** Load an agent definition by name */
  loadAgent(name: string): Promise<AgentDefinition>;

  /** Load a skill definition by name */
  loadSkill(name: string): Promise<SkillDefinition>;

  /** Load a tool definition by name */
  loadTool(name: string): Promise<ToolDefinition>;

  /** Load a hook definition by name */
  loadHook(name: string): Promise<HookDefinition>;

  /** Load an output style definition by name */
  loadOutputStyle(name: string): Promise<OutputStyleDefinition>;

  /** Load a command definition by name */
  loadCommand(name: string): Promise<CommandDefinition>;

  /** Load a template file by name, returning the raw template string */
  loadTemplate(name: string): Promise<string>;
}

/**
 * Agent definition structure
 * Represents a loaded agent's full configuration
 */
export interface AgentDefinition {
  name: string;
  description: string;
  system_prompt: string;
  capabilities: string[];
  constraints: string[];
  skills: string[];
}

/**
 * Skill definition structure
 * Represents a loaded skill's full configuration
 */
export interface SkillDefinition {
  name: string;
  description: string;
  content: string;
  references: string[];
  templates: string[];
  scripts: string[];
}

/**
 * Tool definition structure
 * Represents a loaded tool's full configuration
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  implementation: string;
}

/**
 * Hook definition structure
 * Represents a loaded hook's full configuration
 */
export interface HookDefinition {
  name: string;
  event: string;
  handler: string;
  async?: boolean;
  timeout_ms?: number;
}

/**
 * Output style definition structure
 * Represents a loaded output style's full configuration
 */
export interface OutputStyleDefinition {
  name: string;
  description: string;
  rules: string[];
}

/**
 * Command definition structure
 * Represents a loaded command's full configuration
 */
export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  content: string;
}

/**
 * Project state directory structure
 * Defines the .goodvibes directory layout for project-specific state
 * @see SPEC-v2 Section 14.2
 */
export const PROJECT_STATE_STRUCTURE = {
  root: '.goodvibes',
  directories: {
    state: '.goodvibes/state',
    memory: '.goodvibes/memory',
    checkpoints: '.goodvibes/checkpoints',
    telemetry: '.goodvibes/telemetry',
    logs: '.goodvibes/logs',
    cache: '.goodvibes/cache'
  },
  files: {
    session: '.goodvibes/state/session.json',
    agents: '.goodvibes/state/agents.json',
    locks: '.goodvibes/state/locks.json',
    health: '.goodvibes/state/health.json',
    decisions: '.goodvibes/memory/decisions.md',
    patterns: '.goodvibes/memory/patterns.md',
    failures: '.goodvibes/memory/failures.md',
    preferences: '.goodvibes/memory/preferences.json',
    memory_index: '.goodvibes/memory/index.json',
    current_telemetry: '.goodvibes/telemetry/current.json',
    aggregations: '.goodvibes/telemetry/aggregations.json',
    activity_log: '.goodvibes/logs/activity.md',
    decisions_log: '.goodvibes/logs/decisions.md',
    errors_log: '.goodvibes/logs/errors.md',
    stack_cache: '.goodvibes/cache/stack.json',
    symbols_cache: '.goodvibes/cache/symbols.json',
    deps_cache: '.goodvibes/cache/deps.json'
  }
} as const;

/**
 * Type for agent names based on SPEC-v2 consolidated agents
 */
export type AgentName = typeof AGENTS_STRUCTURE.agents[number];

/**
 * Type for output style names
 */
export type OutputStyleName = typeof OUTPUT_STYLES_STRUCTURE.styles[number];

/**
 * Type for command names based on SPEC-v2
 */
export type CommandName = typeof COMMANDS_STRUCTURE.commands[number];
