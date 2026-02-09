/**
 * CommandHistory - Session-scoped command history for precision_exec.
 * 
 * Maintains an LRU-evicted history of executed commands with statistics and context.
 * Used for debugging, repeat command detection, and inline hints in output modes.
 * 
 * Features:
 * - LRU eviction when maxEntries exceeded (oldest removed first)
 * - Built-in exec_history command for querying history and statistics
 * - Inline context hints (same_command_last_run) in standard/verbose modes
 * - Singleton pattern with getInstance() and resetInstance() for testing
 */

/** Maximum number of history entries to retain before LRU eviction */
const DEFAULT_MAX_ENTRIES = 100;
/** Multiplier to convert a ratio (0-1) to a percentage (0-100) */
const PERCENT_MULTIPLIER = 100;


/**
 * Single command execution record in the history.
 */
export interface CommandHistoryEntry {
  /** Unique identifier for the command execution */
  id: string;
  /** Unix timestamp (ms) when the command was executed */
  timestamp: number;
  /** The command string that was executed */
  command: string;
  /** Working directory where the command ran */
  cwd: string;
  /** Process exit code (0 = success, non-zero = error) */
  exit_code: number;
  /** Execution duration in milliseconds */
  duration_ms: number;
  /** Number of lines in stdout output */
  stdout_lines: number;
  /** Number of lines in stderr output */
  stderr_lines: number;
  /** Whether output was truncated due to size limits */
  truncated: boolean;
  /** Reserved for Part H (Smart Retry) — populated when retry logic is implemented */
  retries?: number;
  /** Reserved for Part E (Background Execution) — populated when background mode is implemented */
  background?: boolean;
}

export class CommandHistory {
  private static instance: CommandHistory | null = null;
  
  /** In-memory command execution history, ordered by timestamp (oldest first) */
  private entries: CommandHistoryEntry[] = [];
  
  /** Maximum number of entries before LRU eviction */
  private maxEntries: number;

  /**
   * Private constructor for singleton pattern.
   * 
   * @param maxEntries Maximum history entries to retain (default: 100)
   */
  private constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Get the singleton CommandHistory instance.
   * Creates the instance on first call.
   * 
   * @returns The singleton CommandHistory instance
   */
  static getInstance(): CommandHistory {
    if (!CommandHistory.instance) {
      CommandHistory.instance = new CommandHistory();
    }
    return CommandHistory.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    CommandHistory.instance = null;
  }

  /**
   * Add a command execution record to the history.
   * Applies LRU eviction if maxEntries exceeded (removes oldest entry).
   * 
   * @param entry The command execution record to add
   */
  add(entry: CommandHistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift(); // LRU: Remove oldest entry
    }
  }

  /**
   * Get all command history entries.
   * Returns a shallow copy to prevent external mutation.
   * 
   * @returns Array of all history entries, ordered by timestamp (oldest first)
   */
  getAll(): CommandHistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Find the most recent execution of a specific command.
   * Searches backwards through history (most recent first).
   * 
   * @param command The command string to search for (exact match)
   * @returns The most recent matching entry, or undefined if not found
   */
  findByCommand(command: string): CommandHistoryEntry | undefined {
    // Edge case: empty command string never matches
    if (!command || command.trim().length === 0) {
      return undefined;
    }
    
    // Search backwards for most recent match
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].command === command) {
        return this.entries[i];
      }
    }
    return undefined;
  }

  /**
   * Calculate aggregate statistics across all history entries.
   * 
   * @returns Statistics object with totals, durations, and success rate
   */
  getStats(): {
    /** Total number of commands in history */
    total_commands: number;
    /** Cumulative execution time in milliseconds */
    total_duration_ms: number;
    /** Success rate as formatted percentage string (e.g., "85.3%") */
    success_rate: string;
    /** Total number of retry attempts across all commands */
    total_retries: number;
  } {
    const total = this.entries.length;
    const succeeded = this.entries.filter((e) => e.exit_code === 0).length;
    const totalDuration = this.entries.reduce((sum, e) => sum + e.duration_ms, 0);
    const totalRetries = this.entries.reduce((sum, e) => sum + (e.retries || 0), 0);
    
    // Calculate success rate with edge case handling
    const successRate = total > 0 
      ? `${this.formatPercentage(succeeded, total)}%` 
      : '0%';
    
    return {
      total_commands: total,
      total_duration_ms: totalDuration,
      success_rate: successRate,
      total_retries: totalRetries,
    };
  }

  /**
   * Clear all history entries.
   * Used for testing or manual reset.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Update the maximum number of history entries.
   * If the new limit is lower than current entry count, applies LRU eviction immediately.
   * 
   * @param max New maximum entry limit (must be > 0)
   */
  setMaxEntries(max: number): void {
    if (!Number.isFinite(max) || max <= 0 || !Number.isInteger(max)) {
      throw new Error('maxEntries must be a positive integer');
    }
    
    this.maxEntries = max;
    // Apply LRU eviction if current size exceeds new limit
    while (this.entries.length > this.maxEntries) {
      this.entries.shift(); // Remove oldest entries
    }
  }
  
  /**
   * Helper to format percentage with one decimal place.
   * 
   * @param numerator Value to convert to percentage
   * @param denominator Total value (returns "0.0" if zero)
   * @returns Formatted percentage string (e.g., "85.3")
   */
  private formatPercentage(numerator: number, denominator: number): string {
    if (denominator === 0) return '0.0';
    return ((numerator / denominator) * PERCENT_MULTIPLIER).toFixed(1);
  }
}

// Export singleton instance
export const commandHistory = CommandHistory.getInstance();
