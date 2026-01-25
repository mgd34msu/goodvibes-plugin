/**
 * LogsManager - Implements structured logging based on LOGGING-SPEC.md
 *
 * Manages three log types:
 * - decisions.md - Architectural choices with options/rationale
 * - errors.md - Failures with category, root cause, resolution
 * - activity.md - Completed work that passed review
 *
 * All logs are append-only, newest first, with proper markdown formatting.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getLogsDir, getLogFilePath, LogFileType } from "./paths.js";

// ============================================================================
// Error Categories
// ============================================================================

export type ErrorCategory =
  | "TOOL_FAILURE"
  | "AGENT_FAILURE"
  | "BUILD_ERROR"
  | "TEST_FAILURE"
  | "VALIDATION_ERROR"
  | "EXTERNAL_ERROR"
  | "UNKNOWN";

// ============================================================================
// Entry Types
// ============================================================================

export interface DecisionLogEntry {
  title: string;
  context: string;
  options: Array<{
    name: string;
    pros: string[];
    cons: string[];
  }>;
  decision: string;
  rationale: string;
  implications: string;
}

export interface ErrorLogEntry {
  category: ErrorCategory;
  error: string;
  context: {
    task: string;
    agent?: string;
    files?: string[];
  };
  rootCause: string;
  resolution: string;
  prevention?: string;
  status: "RESOLVED" | "UNRESOLVED" | "WORKAROUND";
}

export interface ActivityLogEntry {
  title: string;
  task: string;
  plan?: string;
  status: "COMPLETE" | "PARTIAL" | "IN_PROGRESS";
  completedItems: string[];
  filesModified: string[];
  reviewScore?: string;
  commit?: string;
}

// ============================================================================
// LogsManager Interface
// ============================================================================

export interface ILogsManager {
  ensureLogsDir(): Promise<void>;
  initialize(): Promise<void>;

  // Decision logging
  logDecision(entry: DecisionLogEntry): Promise<void>;

  // Error logging
  logError(entry: ErrorLogEntry): Promise<void>;

  // Activity logging
  logActivity(entry: ActivityLogEntry): Promise<void>;

  // Reading
  readLog(type: LogFileType): Promise<string>;
}

// ============================================================================
// LogsManager Implementation
// ============================================================================

export class LogsManager implements ILogsManager {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Ensures the logs directory exists.
   */
  async ensureLogsDir(): Promise<void> {
    const logsDir = getLogsDir(this.projectRoot);
    await fs.mkdir(logsDir, { recursive: true });
  }

  /**
   * Initializes the logs system by creating directory and empty log files if needed.
   */
  async initialize(): Promise<void> {
    await this.ensureLogsDir();

    // Create empty log files if they don't exist (skip 'spec' as it's documentation)
    const logTypes = ["decisions", "errors", "activity"] as const;

    for (const type of logTypes) {
      const filePath = getLogFilePath(this.projectRoot, type);
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist, create with header
        const header = this.getLogHeader(type);
        await fs.writeFile(filePath, header, "utf8");
      }
    }
  }

  /**
   * Logs a decision entry to decisions.md.
   */
  async logDecision(entry: DecisionLogEntry): Promise<void> {
    const formatted = this.formatDecisionEntry(entry);
    await this.appendToLog("decisions", formatted);
  }

  /**
   * Logs an error entry to errors.md.
   */
  async logError(entry: ErrorLogEntry): Promise<void> {
    const formatted = this.formatErrorEntry(entry);
    await this.appendToLog("errors", formatted);
  }

  /**
   * Logs an activity entry to activity.md.
   */
  async logActivity(entry: ActivityLogEntry): Promise<void> {
    const formatted = this.formatActivityEntry(entry);
    await this.appendToLog("activity", formatted);
  }

  /**
   * Reads the entire contents of a log file.
   */
  async readLog(type: LogFileType): Promise<string> {
    const filePath = getLogFilePath(this.projectRoot, type);
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      // If file doesn't exist, return empty string
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "";
      }
      throw error;
    }
  }

  // ============================================================================
  // Private Formatting Methods
  // ============================================================================

  /**
   * Returns the header for a log file type.
   */
  private getLogHeader(type: "decisions" | "errors" | "activity"): string {
    const headers = {
      decisions: "# Decisions Log\n\nArchitectural choices and trade-off resolutions.\n\n---\n\n",
      errors: "# Errors Log\n\nFailures, blockers, and recovery actions.\n\n---\n\n",
      activity: "# Activity Log\n\nCompleted work that passed review.\n\n---\n\n",
    };
    return headers[type];
  }

  /**
   * Formats a decision entry as markdown matching LOGGING-SPEC.md.
   */
  private formatDecisionEntry(entry: DecisionLogEntry): string {
    const date = this.getDateStamp();
    const lines: string[] = [];

    lines.push(`## ${date}: ${entry.title}`);
    lines.push("");
    lines.push(`**Context**: ${entry.context}`);
    lines.push("");
    lines.push("**Options Considered**:");

    entry.options.forEach((option, index) => {
      lines.push(`${index + 1}. **${option.name}**`);
      lines.push(`   - Pros: ${option.pros.join(", ")}`);
      lines.push(`   - Cons: ${option.cons.join(", ")}`);
    });

    lines.push("");
    lines.push(`**Decision**: ${entry.decision}`);
    lines.push("");
    lines.push(`**Rationale**: ${entry.rationale}`);
    lines.push("");
    lines.push(`**Implications**: ${entry.implications}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Formats an error entry as markdown matching LOGGING-SPEC.md.
   */
  private formatErrorEntry(entry: ErrorLogEntry): string {
    const timestamp = this.getTimestamp();
    const lines: string[] = [];

    lines.push(`## ${timestamp} - ${entry.category}`);
    lines.push("");
    lines.push(`**Error**: ${entry.error}`);
    lines.push("");
    lines.push("**Context**:");
    lines.push(`- Task: ${entry.context.task}`);
    if (entry.context.agent) {
      lines.push(`- Agent: ${entry.context.agent}`);
    }
    if (entry.context.files && entry.context.files.length > 0) {
      lines.push(`- File(s): ${entry.context.files.join(", ")}`);
    }
    lines.push("");
    lines.push(`**Root Cause**: ${entry.rootCause}`);
    lines.push("");
    lines.push(`**Resolution**: ${entry.resolution}`);
    lines.push("");
    if (entry.prevention) {
      lines.push(`**Prevention**: ${entry.prevention}`);
      lines.push("");
    }
    lines.push(`**Status**: ${entry.status}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Formats an activity entry as markdown matching LOGGING-SPEC.md.
   */
  private formatActivityEntry(entry: ActivityLogEntry): string {
    const date = this.getDateStamp();
    const lines: string[] = [];

    lines.push(`## ${date}: ${entry.title}`);
    lines.push("");
    lines.push(`**Task**: ${entry.task}`);
    lines.push("");
    if (entry.plan) {
      lines.push(`**Plan**: ${entry.plan}`);
      lines.push("");
    }
    lines.push(`**Status**: ${entry.status}`);
    lines.push("");
    lines.push("**Completed Items**:");
    entry.completedItems.forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push("");
    lines.push("**Files Modified**:");
    entry.filesModified.forEach((file) => {
      lines.push(`- ${file}`);
    });
    lines.push("");
    if (entry.reviewScore) {
      lines.push(`**Review Score**: ${entry.reviewScore}`);
      lines.push("");
    }
    if (entry.commit) {
      lines.push(`**Commit**: ${entry.commit}`);
      lines.push("");
    }
    lines.push("---");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Appends content to a log file (newest first - prepends after header).
   */
  private async appendToLog(
    type: "decisions" | "errors" | "activity",
    content: string
  ): Promise<void> {
    const filePath = getLogFilePath(this.projectRoot, type);

    // Read existing content
    let existingContent = "";
    try {
      existingContent = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, create with header
        existingContent = this.getLogHeader(type);
      } else {
        throw error;
      }
    }

    // Find where to insert (after the header and first separator)
    const headerEndMatch = existingContent.match(/^#[^\n]*\n\n[^\n]*\n\n---\n\n/);

    let newContent: string;
    if (headerEndMatch) {
      const headerEnd = headerEndMatch[0].length;
      const header = existingContent.slice(0, headerEnd);
      const body = existingContent.slice(headerEnd);
      // Insert new content after header (newest first)
      newContent = header + content + body;
    } else {
      // No header found, just prepend
      newContent = content + existingContent;
    }

    await fs.writeFile(filePath, newContent, "utf8");
  }

  /**
   * Gets current date in YYYY-MM-DD format.
   */
  private getDateStamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Gets current timestamp in YYYY-MM-DD HH:MM format.
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new LogsManager instance.
 */
export function createLogsManager(projectRoot: string): LogsManager {
  return new LogsManager(projectRoot);
}
