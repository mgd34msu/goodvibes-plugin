import { randomUUID } from "crypto";

/**
 * Operation types supported by the batch engine.
 */
export type OperationType = "READ" | "WRITE" | "EDIT" | "EXEC" | "QUERY";

/**
 * Base operation interface.
 */
export interface BaseOperation {
  /** Unique operation ID */
  id: string;
  /** Operation type */
  type: OperationType;
  /** Whether this operation is optional (won't fail transaction) */
  optional?: boolean;
  /** Timeout in milliseconds */
  timeout_ms?: number;
}

/**
 * Read operation - read file contents.
 */
export interface ReadOperation extends BaseOperation {
  type: "READ";
  /** File path to read */
  path: string;
  /** Start line (optional) */
  offset?: number;
  /** Number of lines (optional) */
  limit?: number;
}

/**
 * Write operation - create or overwrite file.
 */
export interface WriteOperation extends BaseOperation {
  type: "WRITE";
  /** File path to write */
  path: string;
  /** Content to write */
  content: string;
}

/**
 * Edit operation - modify existing file.
 */
export interface EditOperation extends BaseOperation {
  type: "EDIT";
  /** File path to edit */
  path: string;
  /** Original content to find */
  old_content: string;
  /** New content to replace with */
  new_content: string;
  /** Replace all occurrences */
  replace_all?: boolean;
}

/**
 * Exec operation - execute a command.
 */
export interface ExecOperation extends BaseOperation {
  type: "EXEC";
  /** Command to execute */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Expected exit code (default: 0) */
  expected_exit_code?: number;
  /** Expected output patterns (regex) */
  expected_output?: string[];
  /** Patterns that indicate failure */
  failure_patterns?: string[];
}

/**
 * Query operation - execute LSP or validation queries.
 */
export interface QueryOperation extends BaseOperation {
  type: "QUERY";
  /** Query type */
  query_type: "typecheck" | "lint" | "test" | "lsp" | "custom";
  /** Target file or pattern */
  target?: string;
  /** Query-specific options */
  options?: Record<string, unknown>;
  /** Expected result (for validation) */
  expected?: {
    success?: boolean;
    error_count?: number;
    warning_count?: number;
  };
}

/**
 * Union type for all operations.
 */
export type Operation = ReadOperation | WriteOperation | EditOperation | ExecOperation | QueryOperation;

/**
 * Result of a single operation.
 */
export interface OperationResult {
  /** Operation ID */
  id: string;
  /** Operation type */
  type: OperationType;
  /** Whether operation succeeded */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  duration_ms: number;
}

/**
 * Transaction configuration.
 */
export interface TransactionConfig {
  /** Transaction name for logging */
  name: string;
  /** Whether to rollback on any failure */
  atomic: boolean;
  /** Whether to continue on optional operation failures */
  continue_on_optional_failure: boolean;
  /** Global timeout in milliseconds */
  timeout_ms: number;
  /** Dry run - validate but don't execute */
  dry_run: boolean;
}

/**
 * Transaction result.
 */
export interface TransactionResult {
  /** Transaction ID */
  id: string;
  /** Transaction name */
  name: string;
  /** Whether transaction succeeded */
  success: boolean;
  /** Individual operation results */
  results: OperationResult[];
  /** Total duration in milliseconds */
  total_duration_ms: number;
  /** Whether rollback was performed */
  rolled_back: boolean;
  /** Rollback error if rollback failed */
  rollback_error?: string;
  /** Summary message */
  summary: string;
}

/**
 * Rollback state for transaction recovery.
 */
interface RollbackState {
  /** File backups (path -> original content) */
  file_backups: Map<string, string | null>;
  /** Created files that need deletion */
  created_files: string[];
}

/** Default transaction config */
const DEFAULT_TRANSACTION_CONFIG: TransactionConfig = {
  name: "unnamed",
  atomic: true,
  continue_on_optional_failure: true,
  timeout_ms: 300000, // 5 minutes
  dry_run: false,
};

/**
 * Callback for executing operations (injected dependency).
 */
export interface OperationExecutor {
  readFile: (path: string, offset?: number, limit?: number) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
  deleteFile: (path: string) => Promise<void>;
  execCommand: (command: string, cwd?: string, env?: Record<string, string>) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  runTypecheck: (target?: string) => Promise<{ success: boolean; errors: number; warnings: number; output: string }>;
  runLint: (target?: string) => Promise<{ success: boolean; errors: number; warnings: number; output: string }>;
  runTests: (target?: string) => Promise<{ success: boolean; passed: number; failed: number; output: string }>;
}

/**
 * Batch engine for executing multiple operations atomically.
 */
export class BatchEngine {
  private executor: OperationExecutor | null = null;

  /**
   * Sets the operation executor.
   */
  setExecutor(executor: OperationExecutor): void {
    this.executor = executor;
  }

  /**
   * Executes a batch of operations as a transaction.
   */
  async executeTransaction(
    operations: Operation[],
    config: Partial<TransactionConfig> = {}
  ): Promise<TransactionResult> {
    const fullConfig = { ...DEFAULT_TRANSACTION_CONFIG, ...config };
    const transactionId = randomUUID();
    const startTime = Date.now();

    const result: TransactionResult = {
      id: transactionId,
      name: fullConfig.name,
      success: true,
      results: [],
      total_duration_ms: 0,
      rolled_back: false,
      summary: "",
    };

    const rollbackState: RollbackState = {
      file_backups: new Map(),
      created_files: [],
    };

    try {
      // Execute operations
      for (const op of operations) {
        const opResult = await this.executeOperation(op, fullConfig, rollbackState);
        result.results.push(opResult);

        if (!opResult.success) {
          if (op.optional && fullConfig.continue_on_optional_failure) {
            // Continue despite optional failure
            continue;
          }

          result.success = false;

          if (fullConfig.atomic && !fullConfig.dry_run) {
            // Rollback all changes
            try {
              await this.rollback(rollbackState);
              result.rolled_back = true;
            } catch (rollbackError) {
              result.rollback_error = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            }
          }

          break;
        }
      }

      result.total_duration_ms = Date.now() - startTime;
      result.summary = this.generateSummary(result);

      return result;
    } catch (error) {
      result.success = false;
      result.total_duration_ms = Date.now() - startTime;
      result.summary = `Transaction failed: ${error instanceof Error ? error.message : String(error)}`;

      if (fullConfig.atomic && !fullConfig.dry_run) {
        try {
          await this.rollback(rollbackState);
          result.rolled_back = true;
        } catch (rollbackError) {
          result.rollback_error = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        }
      }

      return result;
    }
  }

  /**
   * Executes a single operation.
   */
  private async executeOperation(
    op: Operation,
    config: TransactionConfig,
    rollbackState: RollbackState
  ): Promise<OperationResult> {
    const startTime = Date.now();

    if (!this.executor && !config.dry_run) {
      return {
        id: op.id,
        type: op.type,
        success: false,
        error: "No executor configured",
        duration_ms: Date.now() - startTime,
      };
    }

    if (config.dry_run) {
      return {
        id: op.id,
        type: op.type,
        success: true,
        data: { dry_run: true },
        duration_ms: Date.now() - startTime,
      };
    }

    try {
      const timeout = op.timeout_ms || config.timeout_ms;
      const result = await Promise.race([
        this.executeOperationInternal(op, rollbackState),
        this.createTimeout(timeout),
      ]);

      return {
        id: op.id,
        type: op.type,
        ...result,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        id: op.id,
        type: op.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Internal operation execution.
   */
  private async executeOperationInternal(
    op: Operation,
    rollbackState: RollbackState
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    switch (op.type) {
      case "READ":
        return this.executeRead(op);
      case "WRITE":
        return this.executeWrite(op, rollbackState);
      case "EDIT":
        return this.executeEdit(op, rollbackState);
      case "EXEC":
        return this.executeExec(op);
      case "QUERY":
        return this.executeQuery(op);
      default:
        return { success: false, error: `Unknown operation type` };
    }
  }

  /**
   * Execute READ operation.
   */
  private async executeRead(op: ReadOperation): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const content = await this.executor!.readFile(op.path, op.offset, op.limit);
      return { success: true, data: { content } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Execute WRITE operation.
   */
  private async executeWrite(
    op: WriteOperation,
    rollbackState: RollbackState
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      // Backup existing file if it exists
      const exists = await this.executor!.fileExists(op.path);
      if (exists) {
        const originalContent = await this.executor!.readFile(op.path);
        rollbackState.file_backups.set(op.path, originalContent);
      } else {
        rollbackState.file_backups.set(op.path, null);
        rollbackState.created_files.push(op.path);
      }

      await this.executor!.writeFile(op.path, op.content);
      return { success: true, data: { path: op.path, bytes: op.content.length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Execute EDIT operation.
   */
  private async executeEdit(
    op: EditOperation,
    rollbackState: RollbackState
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      // Read and backup original
      const originalContent = await this.executor!.readFile(op.path);
      rollbackState.file_backups.set(op.path, originalContent);

      // Check if old_content exists
      if (!originalContent.includes(op.old_content)) {
        return { success: false, error: "Old content not found in file" };
      }

      // Perform replacement
      let newContent: string;
      if (op.replace_all) {
        newContent = originalContent.split(op.old_content).join(op.new_content);
      } else {
        newContent = originalContent.replace(op.old_content, op.new_content);
      }

      await this.executor!.writeFile(op.path, newContent);
      return { success: true, data: { path: op.path, changes: 1 } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Execute EXEC operation.
   */
  private async executeExec(op: ExecOperation): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const result = await this.executor!.execCommand(op.command, op.cwd, op.env);
      const expectedExitCode = op.expected_exit_code ?? 0;

      // Check exit code
      if (result.exitCode !== expectedExitCode) {
        return {
          success: false,
          error: `Exit code ${result.exitCode}, expected ${expectedExitCode}`,
          data: result,
        };
      }

      // Check expected output patterns
      if (op.expected_output) {
        const fullOutput = result.stdout + result.stderr;
        for (const pattern of op.expected_output) {
          if (!new RegExp(pattern).test(fullOutput)) {
            return {
              success: false,
              error: `Expected output pattern not found: ${pattern}`,
              data: result,
            };
          }
        }
      }

      // Check failure patterns
      if (op.failure_patterns) {
        const fullOutput = result.stdout + result.stderr;
        for (const pattern of op.failure_patterns) {
          if (new RegExp(pattern).test(fullOutput)) {
            return {
              success: false,
              error: `Failure pattern detected: ${pattern}`,
              data: result,
            };
          }
        }
      }

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Execute QUERY operation.
   */
  private async executeQuery(op: QueryOperation): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      let result: { success: boolean; errors?: number; warnings?: number; output?: string; passed?: number; failed?: number };

      switch (op.query_type) {
        case "typecheck":
          result = await this.executor!.runTypecheck(op.target);
          break;
        case "lint":
          result = await this.executor!.runLint(op.target);
          break;
        case "test":
          result = await this.executor!.runTests(op.target);
          break;
        default:
          return { success: false, error: `Unknown query type: ${op.query_type}` };
      }

      // Check expected results
      if (op.expected) {
        if (op.expected.success !== undefined && result.success !== op.expected.success) {
          return {
            success: false,
            error: `Expected success=${op.expected.success}, got ${result.success}`,
            data: result,
          };
        }
        if (op.expected.error_count !== undefined && (result.errors || 0) > op.expected.error_count) {
          return {
            success: false,
            error: `Expected at most ${op.expected.error_count} errors, got ${result.errors}`,
            data: result,
          };
        }
      }

      return { success: result.success, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Rolls back changes made during the transaction.
   */
  private async rollback(state: RollbackState): Promise<void> {
    // Restore file backups
    for (const [path, originalContent] of state.file_backups.entries()) {
      if (originalContent === null) {
        // File was created, delete it
        try {
          await this.executor!.deleteFile(path);
        } catch {
          // Ignore deletion errors during rollback
        }
      } else {
        // Restore original content
        try {
          await this.executor!.writeFile(path, originalContent);
        } catch {
          // Ignore write errors during rollback
        }
      }
    }
  }

  /**
   * Creates a timeout promise.
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    });
  }

  /**
   * Generates a summary message for the transaction.
   */
  private generateSummary(result: TransactionResult): string {
    const succeeded = result.results.filter((r) => r.success).length;
    const failed = result.results.filter((r) => !r.success).length;
    const total = result.results.length;

    let summary = `${result.name}: ${succeeded}/${total} operations succeeded`;

    if (failed > 0) {
      summary += `, ${failed} failed`;
    }

    if (result.rolled_back) {
      summary += " (rolled back)";
    }

    summary += ` in ${result.total_duration_ms}ms`;

    return summary;
  }

  /**
   * Creates a READ operation.
   */
  static read(path: string, options?: { offset?: number; limit?: number; optional?: boolean }): ReadOperation {
    return {
      id: randomUUID(),
      type: "READ",
      path,
      ...options,
    };
  }

  /**
   * Creates a WRITE operation.
   */
  static write(path: string, content: string, options?: { optional?: boolean }): WriteOperation {
    return {
      id: randomUUID(),
      type: "WRITE",
      path,
      content,
      ...options,
    };
  }

  /**
   * Creates an EDIT operation.
   */
  static edit(
    path: string,
    old_content: string,
    new_content: string,
    options?: { replace_all?: boolean; optional?: boolean }
  ): EditOperation {
    return {
      id: randomUUID(),
      type: "EDIT",
      path,
      old_content,
      new_content,
      ...options,
    };
  }

  /**
   * Creates an EXEC operation.
   */
  static exec(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      expected_exit_code?: number;
      expected_output?: string[];
      failure_patterns?: string[];
      optional?: boolean;
    }
  ): ExecOperation {
    return {
      id: randomUUID(),
      type: "EXEC",
      command,
      ...options,
    };
  }

  /**
   * Creates a QUERY operation.
   */
  static query(
    query_type: QueryOperation["query_type"],
    options?: {
      target?: string;
      expected?: QueryOperation["expected"];
      optional?: boolean;
    }
  ): QueryOperation {
    return {
      id: randomUUID(),
      type: "QUERY",
      query_type,
      ...options,
    };
  }
}
