/**
 * CommandHistory - Session-scoped command history for precision_exec.
 * Tracks commands executed during the session for debugging and context.
 */

export interface CommandHistoryEntry {
  id: string;
  timestamp: number;
  command: string;
  cwd: string;
  exit_code: number;
  duration_ms: number;
  stdout_lines: number;
  stderr_lines: number;
  truncated: boolean;
  retries?: number;
  background?: boolean;
}

export class CommandHistory {
  private static instance: CommandHistory | null = null;
  private entries: CommandHistoryEntry[] = [];
  private maxEntries: number;

  private constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

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

  add(entry: CommandHistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getAll(): CommandHistoryEntry[] {
    return [...this.entries];
  }

  findByCommand(command: string): CommandHistoryEntry | undefined {
    // Return most recent matching command
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].command === command) {
        return this.entries[i];
      }
    }
    return undefined;
  }

  getStats(): {
    total_commands: number;
    total_duration_ms: number;
    success_rate: string;
    retries_total: number;
  } {
    const total = this.entries.length;
    const succeeded = this.entries.filter((e) => e.exit_code === 0).length;
    const totalDuration = this.entries.reduce((sum, e) => sum + e.duration_ms, 0);
    const retriesTotal = this.entries.reduce((sum, e) => sum + (e.retries || 0), 0);
    return {
      total_commands: total,
      total_duration_ms: totalDuration,
      success_rate: total > 0 ? `${((succeeded / total) * 100).toFixed(1)}%` : '0%',
      retries_total: retriesTotal,
    };
  }

  clear(): void {
    this.entries = [];
  }

  setMaxEntries(max: number): void {
    this.maxEntries = max;
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }
}

// Export singleton instance
export const commandHistory = CommandHistory.getInstance();
