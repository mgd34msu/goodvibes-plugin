/**
 * Command interfaces for Batch Engine
 * @see SPEC-v2 Section 14.1
 */

import type { ModeName } from './mode.js';
import type { BatchStatus } from './tools/batch-status.js';
import type { RollbackScope } from './rollback.js';

// ============================================================================
// Base Command Interfaces
// ============================================================================

/**
 * Base command interface that all commands must implement
 * Commands are user-facing entry points (slash commands like /batch, /status)
 */
export interface Command {
  /** Command name (without leading slash) */
  name: string;
  /** Human-readable description of what the command does */
  description: string;
  /** Alternative names for this command */
  aliases: string[];
  /** Usage pattern showing syntax */
  usage: string;
  /** Example invocations */
  examples: string[];

  /**
   * Execute the command with parsed arguments
   * @param args - Parsed command arguments
   * @returns Command result
   */
  execute(args: CommandArgs): Promise<CommandResult>;

  /**
   * Parse raw input string into structured arguments
   * @param input - Raw input string after command name
   * @returns Parsed command arguments
   */
  parseArgs(input: string): CommandArgs;

  /**
   * Validate parsed arguments before execution
   * @param args - Parsed command arguments
   * @returns Validation result with any errors
   */
  validate(args: CommandArgs): CommandValidation;
}

/**
 * Parsed command arguments
 * Supports positional args, boolean flags, and key-value options
 */
export interface CommandArgs {
  /** Positional arguments (non-flag, non-option values) */
  positional: string[];
  /** Boolean flags (--flag or -f without value) */
  flags: Record<string, boolean>;
  /** Key-value options (--key=value or --key value) */
  options: Record<string, string>;
  /** Original raw input string */
  raw: string;
}

/**
 * Result returned from command execution
 */
export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Human-readable output to display */
  output: string;
  /** Structured data from the command (command-specific) */
  data?: unknown;
  /** Error message if command failed */
  error?: string;
}

/**
 * Result of command argument validation
 */
export interface CommandValidation {
  /** Whether the arguments are valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
}

// ============================================================================
// /batch Command
// ============================================================================

/**
 * /batch command for executing batch operations
 * Main entry point for batch processing
 */
export interface BatchCommand extends Command {
  name: 'batch';

  /** Subcommands for batch operations */
  subcommands: {
    /** Execute batch operations */
    run: BatchRunSubcommand;
    /** Preview batch operations without executing */
    preview: BatchPreviewSubcommand;
    /** Check status of a batch */
    status: BatchStatusSubcommand;
  };
}

/**
 * /batch run subcommand
 * Executes a batch of operations
 */
export interface BatchRunSubcommand {
  /**
   * Execute batch operations
   * @param operations - Operations string in batch DSL format
   * @returns Result of batch execution
   */
  execute(operations: string): Promise<CommandResult>;
}

/**
 * /batch preview subcommand
 * Shows what would happen without making changes
 */
export interface BatchPreviewSubcommand {
  /**
   * Preview batch operations (dry run)
   * @param operations - Operations string in batch DSL format
   * @returns Preview of what would be executed
   */
  execute(operations: string): Promise<CommandResult>;
}

/**
 * /batch status subcommand
 * Shows status of running or completed batches
 */
export interface BatchStatusSubcommand {
  /**
   * Get batch status
   * @param batchId - Specific batch ID (optional, defaults to latest)
   * @returns Status information
   */
  execute(batchId?: string): Promise<CommandResult>;
}

// ============================================================================
// /status Command
// ============================================================================

/**
 * /status command for checking system and batch status
 * Quick overview of current state
 */
export interface StatusCommand extends Command {
  name: 'status';

  /** Command-specific options */
  options: {
    /** Specific batch ID to check */
    batch: string;
    /** Show agent status */
    agents: boolean;
    /** Show token usage */
    tokens: boolean;
    /** Enable detailed output */
    detailed: boolean;
  };
}

/**
 * Status command output structure
 */
export interface StatusOutput {
  /** Current system status */
  system: {
    /** Whether system is healthy */
    healthy: boolean;
    /** Number of active batches */
    active_batches: number;
    /** Number of active agents */
    active_agents: number;
  };

  /** Batch-specific status (when --batch specified) */
  batch?: {
    /** Batch ID */
    id: string;
    /** Current status */
    status: BatchStatus;
    /** Progress percentage */
    progress: number;
    /** Operations completed */
    completed: number;
    /** Total operations */
    total: number;
  };

  /** Agent status (when --agents specified) */
  agents?: Array<{
    /** Agent ID */
    id: string;
    /** Agent type */
    type: string;
    /** Current status */
    status: 'idle' | 'running' | 'error';
    /** Current operation (if running) */
    current_operation?: string;
  }>;

  /** Token usage (when --tokens specified) */
  tokens?: {
    /** Tokens used in current session */
    session: number;
    /** Tokens used today */
    today: number;
    /** Token limit (if any) */
    limit?: number;
  };
}

// ============================================================================
// /recover Command
// ============================================================================

/**
 * /recover command for recovery operations
 * Rollback, restore, retry, and cleanup functionality
 */
export interface RecoverCommand extends Command {
  name: 'recover';

  /** Subcommands for recovery operations */
  subcommands: {
    /** Rollback changes */
    rollback: RollbackSubcommand;
    /** Restore from checkpoint */
    restore: RestoreSubcommand;
    /** Retry failed operations */
    retry: RetrySubcommand;
    /** Clean up checkpoints and logs */
    cleanup: CleanupSubcommand;
  };
}

/**
 * Scope for rollback operations
 */
export type RollbackCommandScope = 'all' | 'files' | 'state';

/**
 * /recover rollback subcommand
 * Reverts changes to a previous state
 */
export interface RollbackSubcommand {
  /**
   * Execute rollback
   * @param scope - What to rollback (all, files, state)
   * @param target - Optional target batch ID or checkpoint ID
   * @returns Result of rollback operation
   */
  execute(scope: RollbackCommandScope, target?: string): Promise<CommandResult>;
}

/**
 * /recover restore subcommand
 * Restores from a specific checkpoint
 */
export interface RestoreSubcommand {
  /**
   * Restore from checkpoint
   * @param checkpointId - ID of checkpoint to restore
   * @returns Result of restore operation
   */
  execute(checkpointId: string): Promise<CommandResult>;
}

/**
 * /recover retry subcommand
 * Retries failed operations
 */
export interface RetrySubcommand {
  /**
   * Retry failed operations
   * @param operationId - Specific operation ID (optional, defaults to all failed)
   * @returns Result of retry operation
   */
  execute(operationId?: string): Promise<CommandResult>;
}

/**
 * Targets for cleanup operations
 */
export type CleanupTarget = 'checkpoints' | 'logs' | 'cache' | 'all';

/**
 * /recover cleanup subcommand
 * Cleans up old checkpoints, logs, and cache
 */
export interface CleanupSubcommand {
  /**
   * Execute cleanup
   * @param target - What to clean up
   * @returns Result of cleanup operation
   */
  execute(target: CleanupTarget): Promise<CommandResult>;
}

// ============================================================================
// /mode Command
// ============================================================================

/**
 * /mode command for managing operating mode
 * Switch between vibecoding and justvibes modes
 */
export interface ModeCommand extends Command {
  name: 'mode';

  /** Subcommands for mode management */
  subcommands: {
    /** Get current mode */
    get: ModeGetSubcommand;
    /** Set operating mode */
    set: ModeSetSubcommand;
    /** List available modes */
    list: ModeListSubcommand;
  };
}

/**
 * /mode get subcommand
 * Shows current operating mode
 */
export interface ModeGetSubcommand {
  /**
   * Get current mode
   * @returns Current mode information
   */
  execute(): Promise<CommandResult>;
}

/**
 * /mode set subcommand
 * Changes the operating mode
 */
export interface ModeSetSubcommand {
  /**
   * Set operating mode
   * @param modeName - Name of mode to activate
   * @returns Result of mode change
   */
  execute(modeName: ModeName): Promise<CommandResult>;
}

/**
 * /mode list subcommand
 * Lists all available modes
 */
export interface ModeListSubcommand {
  /**
   * List available modes
   * @returns List of modes with descriptions
   */
  execute(): Promise<CommandResult>;
}

// ============================================================================
// Command Registry
// ============================================================================

/**
 * Registry for managing commands
 * Central point for command registration and lookup
 */
export interface CommandRegistry {
  /** Registered commands by name */
  commands: Map<string, Command>;
  /** Alias to command name mapping */
  aliases: Map<string, string>;

  /**
   * Register a command
   * @param command - Command to register
   */
  register(command: Command): void;

  /**
   * Unregister a command by name
   * @param name - Command name to remove
   */
  unregister(name: string): void;

  /**
   * Get a command by name or alias
   * @param nameOrAlias - Command name or alias
   * @returns Command if found, undefined otherwise
   */
  get(nameOrAlias: string): Command | undefined;

  /**
   * List all registered command names
   * @returns Array of command names
   */
  list(): string[];

  /**
   * Parse and execute a command from raw input
   * @param input - Raw command input (e.g., "/batch run ...")
   * @returns Command execution result
   */
  execute(input: string): Promise<CommandResult>;
}

// ============================================================================
// Command Parser
// ============================================================================

/**
 * Parser for command input strings
 */
export interface CommandParser {
  /**
   * Parse raw input into structured command parts
   * @param input - Raw input string
   * @returns Parsed command structure
   */
  parse(input: string): ParsedCommand;
}

/**
 * Result of parsing a command string
 */
export interface ParsedCommand {
  /** Main command name (without leading slash) */
  command: string;
  /** Subcommand name (if present) */
  subcommand?: string;
  /** Parsed arguments */
  args: CommandArgs;
}

// ============================================================================
// Command Configuration
// ============================================================================

/**
 * Configuration for a single command
 * Used in COMMANDS_CONFIG for declarative command definitions
 */
export interface CommandConfig {
  /** Command name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Command aliases */
  aliases: readonly string[];
  /** Usage syntax */
  usage: string;
  /** Example invocations */
  examples: readonly string[];
}

/**
 * All commands configuration
 * Declarative definitions for all batch engine commands
 */
export const COMMANDS_CONFIG = {
  batch: {
    name: 'batch',
    description: 'Execute batch operations',
    aliases: ['b'] as const,
    usage: '/batch <run|preview|status> [options]',
    examples: [
      '/batch run "read: src/**/*.ts, write: fix imports"',
      '/batch preview "edit: {file: index.ts, search: foo, replace: bar}"',
      '/batch status batch_123',
    ] as const,
  },
  status: {
    name: 'status',
    description: 'Check batch and agent status',
    aliases: ['s', 'stat'] as const,
    usage: '/status [--batch <id>] [--agents] [--tokens]',
    examples: [
      '/status',
      '/status --batch batch_123',
      '/status --agents --detailed',
    ] as const,
  },
  recover: {
    name: 'recover',
    description: 'Recovery operations',
    aliases: ['r', 'rec'] as const,
    usage: '/recover <rollback|restore|retry|cleanup> [options]',
    examples: [
      '/recover rollback all',
      '/recover restore cp_20240120_153045',
      '/recover retry op_123',
      '/recover cleanup checkpoints',
    ] as const,
  },
  mode: {
    name: 'mode',
    description: 'Manage operating mode',
    aliases: ['m'] as const,
    usage: '/mode <get|set|list> [mode_name]',
    examples: [
      '/mode get',
      '/mode set justvibes',
      '/mode list',
    ] as const,
  },
} as const;

/**
 * Type for command names from COMMANDS_CONFIG
 */
export type CommandName = keyof typeof COMMANDS_CONFIG;

// ============================================================================
// Command Factory Types
// ============================================================================

/**
 * Dependencies required to create commands
 */
export interface CommandDependencies {
  /** Batch execution system */
  batchExecutor: {
    run(operations: string): Promise<{ success: boolean; batch_id: string; results: unknown }>;
    preview(operations: string): Promise<{ operations: unknown[]; impact: unknown }>;
  };

  /** Status checking system */
  statusChecker: {
    getSystemStatus(): Promise<StatusOutput['system']>;
    getBatchStatus(id: string): Promise<StatusOutput['batch']>;
    getAgentStatus(): Promise<StatusOutput['agents']>;
    getTokenUsage(): Promise<StatusOutput['tokens']>;
  };

  /** Recovery system */
  recoverySystem: {
    rollback(scope: RollbackScope, target?: string): Promise<{ success: boolean; files_rolled_back: string[] }>;
    restore(checkpointId: string): Promise<{ success: boolean; checkpoint_id: string }>;
    retry(operationId?: string): Promise<{ success: boolean; operations_retried: number }>;
    cleanup(target: CleanupTarget): Promise<{ success: boolean; items_cleaned: number }>;
  };

  /** Mode management system */
  modeManager: {
    getCurrentMode(): ModeName;
    setMode(name: ModeName): Promise<{ success: boolean; previous: ModeName }>;
    listModes(): Array<{ name: ModeName; description: string; active: boolean }>;
  };
}

/**
 * Factory function type for creating command instances
 */
export type CreateCommand<T extends Command> = (
  dependencies: CommandDependencies
) => T;

/**
 * Factory for creating all commands
 */
export type CreateCommands = (
  dependencies: CommandDependencies
) => {
  batch: BatchCommand;
  status: StatusCommand;
  recover: RecoverCommand;
  mode: ModeCommand;
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a string is a valid command name
 */
export function isCommandName(value: string): value is CommandName {
  return value in COMMANDS_CONFIG;
}

/**
 * Check if a command result indicates success
 */
export function isSuccessResult(result: CommandResult): result is CommandResult & { success: true } {
  return result.success === true;
}

/**
 * Check if a command result indicates failure
 */
export function isErrorResult(result: CommandResult): result is CommandResult & { success: false; error: string } {
  return result.success === false && typeof result.error === 'string';
}

/**
 * Check if parsed command has a subcommand
 */
export function hasSubcommand(
  parsed: ParsedCommand
): parsed is ParsedCommand & { subcommand: string } {
  return typeof parsed.subcommand === 'string' && parsed.subcommand.length > 0;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create empty command arguments
 */
export function createEmptyArgs(raw: string = ''): CommandArgs {
  return {
    positional: [],
    flags: {},
    options: {},
    raw,
  };
}

/**
 * Create a successful command result
 */
export function createSuccessResult(output: string, data?: unknown): CommandResult {
  return {
    success: true,
    output,
    data,
  };
}

/**
 * Create a failed command result
 */
export function createErrorResult(error: string): CommandResult {
  return {
    success: false,
    output: `Error: ${error}`,
    error,
  };
}

/**
 * Create a validation result with no errors
 */
export function createValidResult(): CommandValidation {
  return {
    valid: true,
    errors: [],
  };
}

/**
 * Create a validation result with errors
 */
export function createInvalidResult(errors: string[]): CommandValidation {
  return {
    valid: false,
    errors,
  };
}

// ============================================================================
// Default Implementations
// ============================================================================

/**
 * Default command parser implementation
 * Parses slash commands into structured format
 */
export const defaultCommandParser: CommandParser = {
  parse(input: string): ParsedCommand {
    const trimmed = input.trim();

    // Remove leading slash if present
    const withoutSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;

    // Split into parts
    const parts = withoutSlash.split(/\s+/);
    const command = parts[0] || '';

    // Check if second part is a subcommand (not a flag or option)
    let subcommand: string | undefined;
    let argStartIndex = 1;

    if (parts[1] && !parts[1].startsWith('-') && !parts[1].includes('=')) {
      subcommand = parts[1];
      argStartIndex = 2;
    }

    // Parse remaining parts as args
    const positional: string[] = [];
    const flags: Record<string, boolean> = {};
    const options: Record<string, string> = {};

    for (let i = argStartIndex; i < parts.length; i++) {
      const part = parts[i];

      if (part.startsWith('--')) {
        // Long flag or option
        const withoutDashes = part.slice(2);
        if (withoutDashes.includes('=')) {
          const [key, value] = withoutDashes.split('=', 2);
          options[key] = value;
        } else if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          // Check if next part is a value
          options[withoutDashes] = parts[++i];
        } else {
          flags[withoutDashes] = true;
        }
      } else if (part.startsWith('-')) {
        // Short flag(s)
        const chars = part.slice(1);
        for (const char of chars) {
          flags[char] = true;
        }
      } else {
        // Positional argument
        positional.push(part);
      }
    }

    return {
      command,
      subcommand,
      args: {
        positional,
        flags,
        options,
        raw: withoutSlash,
      },
    };
  },
};
