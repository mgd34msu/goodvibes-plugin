/**
 * MCP Server Configuration (.mcp.json) interfaces for Batch Engine
 * @see SPEC-v2 Appendix C.2
 */

// ============================================================================
// Core Configuration Interfaces
// ============================================================================

/**
 * Root MCP configuration structure
 * Represents the full .mcp.json configuration file
 */
export interface McpConfig {
  /** Server configurations keyed by name */
  servers: McpServerConfig[];

  /** Global settings for all servers */
  settings: McpSettings;

  /** Tool registry for provided and required tools */
  tools: McpToolRegistry;
}

/**
 * Individual MCP server configuration
 * Defines how to start and manage an MCP server process
 */
export interface McpServerConfig {
  /** Unique server identifier */
  name: string;

  /** Command to start the server (e.g., "node") */
  command: string;

  /** Arguments passed to the command */
  args: string[];

  /** Environment variables for the server process */
  env?: Record<string, string>;

  /** Working directory for the server process */
  cwd?: string;

  /** Whether this server is enabled */
  enabled: boolean;

  /** Connection settings for this server */
  connection: McpConnectionConfig;

  /** Resource limits for this server */
  resources?: McpResourceConfig;
}

/**
 * Connection settings for an MCP server
 */
export interface McpConnectionConfig {
  /** Timeout in milliseconds for server operations */
  timeout_ms: number;

  /** Number of retry attempts on connection failure */
  retry_attempts: number;

  /** Delay in milliseconds between retry attempts */
  retry_delay_ms: number;
}

/**
 * Resource limits for an MCP server
 */
export interface McpResourceConfig {
  /** Maximum memory usage in megabytes */
  max_memory_mb?: number;

  /** Maximum CPU usage as percentage (0-100) */
  max_cpu_percent?: number;
}

// ============================================================================
// Global Settings
// ============================================================================

/**
 * Global MCP settings that apply to all servers
 */
export interface McpSettings {
  /** Default timeout for all server operations in milliseconds */
  default_timeout_ms: number;

  /** Whether to start servers in parallel */
  parallel_startup: boolean;

  /** Health check interval in milliseconds */
  health_check_interval_ms: number;

  /** Logging configuration */
  logging: McpLoggingConfig;
}

/**
 * Logging configuration for MCP operations
 */
export interface McpLoggingConfig {
  /** Whether logging is enabled */
  enabled: boolean;

  /** Log level */
  level: McpLogLevel;

  /** Optional log file path */
  file?: string;
}

/** Valid log levels for MCP logging */
export type McpLogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Tool registry for tracking provided and required tools
 */
export interface McpToolRegistry {
  /** Tools provided by this plugin */
  provided: McpToolDefinition[];

  /** External tools required by this plugin */
  required: McpToolRequirement[];
}

/**
 * Definition of a tool provided by an MCP server
 */
export interface McpToolDefinition {
  /** Tool name (unique within server) */
  name: string;

  /** Human-readable description of the tool */
  description: string;

  /** Server that provides this tool */
  server: string;

  /** JSON Schema for tool input parameters */
  input_schema: McpToolSchema;

  /** JSON Schema for tool output (optional) */
  output_schema?: McpToolSchema;
}

/**
 * JSON Schema object for tool parameters
 */
export interface McpToolSchema {
  type?: string;
  properties?: Record<string, McpToolSchema>;
  required?: string[];
  items?: McpToolSchema;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  [key: string]: unknown;
}

/**
 * Requirement for an external tool
 */
export interface McpToolRequirement {
  /** Tool name */
  name: string;

  /** Server that should provide this tool */
  server: string;

  /** Whether this tool is optional */
  optional: boolean;
}

// ============================================================================
// Configuration Manager
// ============================================================================

/**
 * Manager interface for loading and managing MCP configuration
 */
export interface McpConfigManager {
  /**
   * Load MCP configuration from the default location
   * @returns Promise resolving to the loaded configuration
   */
  load(): Promise<McpConfig>;

  /**
   * Validate the current configuration
   * @returns Promise resolving to validation result
   */
  validate(): Promise<McpConfigValidation>;

  // Server management

  /**
   * Get configuration for a specific server
   * @param name - Server name
   * @returns Server configuration or undefined if not found
   */
  getServerConfig(name: string): McpServerConfig | undefined;

  /**
   * List all configured server names
   * @returns Array of server names
   */
  listServers(): string[];

  /**
   * Enable a server by name
   * @param name - Server name to enable
   */
  enableServer(name: string): void;

  /**
   * Disable a server by name
   * @param name - Server name to disable
   */
  disableServer(name: string): void;

  // Tool management

  /**
   * Get definition for a specific tool
   * @param name - Tool name
   * @returns Tool definition or undefined if not found
   */
  getToolDefinition(name: string): McpToolDefinition | undefined;

  /**
   * List all tools provided by this plugin
   * @returns Array of provided tool names
   */
  listProvidedTools(): string[];

  /**
   * List all tools required by this plugin
   * @returns Array of required tool names
   */
  listRequiredTools(): string[];
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of MCP configuration validation
 */
export interface McpConfigValidation {
  /** Whether the configuration is valid */
  valid: boolean;

  /** Errors related to server configuration */
  server_errors: ServerError[];

  /** Errors related to tool configuration */
  tool_errors: ToolError[];

  /** Non-fatal warnings */
  warnings: string[];
}

/**
 * Error related to a server configuration
 */
export interface ServerError {
  /** Server name where the error occurred */
  server: string;

  /** Error message */
  error: string;

  /** Whether the error can be recovered from */
  recoverable: boolean;
}

/**
 * Error related to a tool configuration
 */
export interface ToolError {
  /** Tool name where the error occurred */
  tool: string;

  /** Error message */
  error: string;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default MCP configuration for GoodVibes plugin
 */
export const DEFAULT_MCP_CONFIG: McpConfig = {
  servers: [
    {
      name: 'goodvibes-tools',
      command: 'node',
      args: ['./tools/implementations/batch-engine/dist/server.js'],
      enabled: true,
      connection: {
        timeout_ms: 30000,
        retry_attempts: 3,
        retry_delay_ms: 1000
      }
    },
    {
      name: 'precision-engine',
      command: 'node',
      args: ['./tools/implementations/precision-engine/dist/server.js'],
      enabled: true,
      connection: {
        timeout_ms: 30000,
        retry_attempts: 3,
        retry_delay_ms: 1000
      }
    }
  ],
  settings: {
    default_timeout_ms: 30000,
    parallel_startup: true,
    health_check_interval_ms: 60000,
    logging: {
      enabled: true,
      level: 'info'
    }
  },
  tools: {
    provided: [],
    required: []
  }
};

/**
 * GoodVibes tools to register with MCP
 */
export const GOODVIBES_TOOLS: McpToolDefinition[] = [
  {
    name: 'batch',
    description: 'Execute batch operations with automatic rollback support',
    server: 'goodvibes-tools',
    input_schema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of operations to execute',
          items: { type: 'object' }
        },
        mode: {
          type: 'string',
          description: 'Execution mode',
          enum: ['vibecoding', 'sturdy', 'autonomous']
        }
      },
      required: ['operations']
    }
  },
  {
    name: 'batch_status',
    description: 'Check the status of a batch operation',
    server: 'goodvibes-tools',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: {
          type: 'string',
          description: 'Batch ID to check status for'
        }
      },
      required: ['batch_id']
    }
  },
  {
    name: 'batch_recover',
    description: 'Recovery operations for failed batches',
    server: 'goodvibes-tools',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: {
          type: 'string',
          description: 'Batch ID to recover'
        },
        action: {
          type: 'string',
          description: 'Recovery action to perform',
          enum: ['retry', 'rollback', 'skip', 'abort']
        }
      },
      required: ['batch_id', 'action']
    }
  },
  {
    name: 'batch_state',
    description: 'State operations for batch management',
    server: 'goodvibes-tools',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'State action to perform',
          enum: ['get', 'set', 'clear', 'list']
        },
        key: {
          type: 'string',
          description: 'State key (for get/set operations)'
        },
        value: {
          description: 'State value (for set operations)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'discover',
    description: 'Lightweight discovery for project structure and patterns',
    server: 'goodvibes-tools',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to discover'
        },
        depth: {
          type: 'number',
          description: 'Discovery depth limit',
          default: 3
        },
        include_hidden: {
          type: 'boolean',
          description: 'Include hidden files and directories',
          default: false
        }
      }
    }
  }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate an MCP configuration object
 * @param config - Configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateMcpConfig(config: McpConfig): McpConfigValidation {
  const server_errors: ServerError[] = [];
  const tool_errors: ToolError[] = [];
  const warnings: string[] = [];

  // Validate servers
  for (const server of config.servers) {
    if (!server.name) {
      server_errors.push({
        server: 'unknown',
        error: 'Server name is required',
        recoverable: false
      });
    }
    if (!server.command) {
      server_errors.push({
        server: server.name || 'unknown',
        error: 'Server command is required',
        recoverable: false
      });
    }
    if (server.connection.timeout_ms <= 0) {
      warnings.push(`Server ${server.name}: timeout_ms should be positive`);
    }
    if (server.connection.retry_attempts < 0) {
      warnings.push(`Server ${server.name}: retry_attempts should be non-negative`);
    }
  }

  // Validate tools
  for (const tool of config.tools.provided) {
    if (!tool.name) {
      tool_errors.push({
        tool: 'unknown',
        error: 'Tool name is required'
      });
    }
    if (!tool.server) {
      tool_errors.push({
        tool: tool.name || 'unknown',
        error: 'Tool server is required'
      });
    }
    // Check if server exists
    const serverExists = config.servers.some(s => s.name === tool.server);
    if (!serverExists) {
      tool_errors.push({
        tool: tool.name,
        error: `Tool references unknown server: ${tool.server}`
      });
    }
  }

  // Validate required tools
  for (const req of config.tools.required) {
    if (!req.name) {
      tool_errors.push({
        tool: 'unknown',
        error: 'Required tool name is required'
      });
    }
    if (!req.server) {
      tool_errors.push({
        tool: req.name || 'unknown',
        error: 'Required tool server is required'
      });
    }
  }

  // Validate settings
  if (config.settings.default_timeout_ms <= 0) {
    warnings.push('settings.default_timeout_ms should be positive');
  }
  if (config.settings.health_check_interval_ms <= 0) {
    warnings.push('settings.health_check_interval_ms should be positive');
  }

  return {
    valid: server_errors.length === 0 && tool_errors.length === 0,
    server_errors,
    tool_errors,
    warnings
  };
}

/**
 * Create an MCP configuration from the raw .mcp.json format
 * @param raw - Raw .mcp.json content (with mcpServers key)
 * @returns Normalized McpConfig object
 */
export function fromRawMcpJson(raw: RawMcpJson): McpConfig {
  const servers: McpServerConfig[] = [];

  for (const [name, serverConfig] of Object.entries(raw.mcpServers || {})) {
    servers.push({
      name,
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env,
      cwd: serverConfig.cwd,
      enabled: serverConfig.enabled !== false,
      connection: {
        timeout_ms: serverConfig.timeout_ms || DEFAULT_MCP_CONFIG.settings.default_timeout_ms,
        retry_attempts: serverConfig.retry_attempts || 3,
        retry_delay_ms: serverConfig.retry_delay_ms || 1000
      },
      resources: serverConfig.resources
    });
  }

  return {
    servers,
    settings: raw.settings || DEFAULT_MCP_CONFIG.settings,
    tools: raw.tools || DEFAULT_MCP_CONFIG.tools
  };
}

/**
 * Convert McpConfig to raw .mcp.json format
 * @param config - Normalized configuration
 * @returns Raw .mcp.json structure
 */
export function toRawMcpJson(config: McpConfig): RawMcpJson {
  const mcpServers: Record<string, RawServerConfig> = {};

  for (const server of config.servers) {
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
      enabled: server.enabled,
      timeout_ms: server.connection.timeout_ms,
      retry_attempts: server.connection.retry_attempts,
      retry_delay_ms: server.connection.retry_delay_ms,
      resources: server.resources
    };
  }

  return {
    mcpServers,
    settings: config.settings,
    tools: config.tools
  };
}

// ============================================================================
// Raw Format Types (for .mcp.json compatibility)
// ============================================================================

/**
 * Raw .mcp.json file format (as stored on disk)
 */
export interface RawMcpJson {
  mcpServers: Record<string, RawServerConfig>;
  settings?: McpSettings;
  tools?: McpToolRegistry;
}

/**
 * Raw server configuration (as stored in .mcp.json)
 */
export interface RawServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
  timeout_ms?: number;
  retry_attempts?: number;
  retry_delay_ms?: number;
  resources?: McpResourceConfig;
}
