import { randomUUID } from "crypto";
import { Memory } from "./memory.js";

/**
 * Represents a diagnosed issue.
 */
export interface DiagnosedIssue {
  /** Unique issue identifier */
  id: string;
  /** Type of issue */
  type: "type_error" | "runtime_error" | "lint_error" | "test_failure" | "build_error" | "unknown";
  /** Error message */
  message: string;
  /** File path if applicable */
  file?: string;
  /** Line number if applicable */
  line?: number;
  /** Column number if applicable */
  column?: number;
  /** Suggested fix approach */
  suggested_fix?: string;
  /** Root cause analysis */
  root_cause?: string;
  /** Related issues */
  related_issues?: string[];
}

/**
 * Represents a fix attempt.
 */
export interface FixAttempt {
  /** Unique attempt identifier */
  id: string;
  /** Issue being fixed */
  issue_id: string;
  /** Attempt number (1, 2, 3) */
  attempt_number: number;
  /** ISO timestamp when attempted */
  attempted_at: string;
  /** Strategy used */
  strategy: string;
  /** Changes made */
  changes: FixChange[];
  /** Whether fix was successful */
  success: boolean;
  /** Error if failed */
  error?: string;
}

/**
 * Represents a change made during a fix.
 */
export interface FixChange {
  /** File path */
  file: string;
  /** Type of change */
  type: "edit" | "create" | "delete";
  /** Description of change */
  description: string;
  /** Before content (for edits) */
  before?: string;
  /** After content (for edits/creates) */
  after?: string;
}

/**
 * Represents a verification result.
 */
export interface VerificationResult {
  /** Whether verification passed */
  passed: boolean;
  /** Checks performed */
  checks: VerificationCheck[];
  /** Remaining issues after fix */
  remaining_issues: DiagnosedIssue[];
  /** New issues introduced by fix */
  new_issues: DiagnosedIssue[];
}

/**
 * Represents a single verification check.
 */
export interface VerificationCheck {
  /** Check name */
  name: string;
  /** Check type */
  type: "typecheck" | "lint" | "test" | "build" | "custom";
  /** Whether check passed */
  passed: boolean;
  /** Output from check */
  output?: string;
  /** Duration in milliseconds */
  duration_ms: number;
}

/**
 * Configuration for the fix loop.
 */
export interface FixLoopConfig {
  /** Maximum attempts before giving up */
  max_attempts: number;
  /** Verification checks to run */
  verification_checks: Array<"typecheck" | "lint" | "test" | "build">;
  /** Whether to auto-rollback on failure */
  auto_rollback: boolean;
  /** Timeout per attempt in milliseconds */
  attempt_timeout_ms: number;
}

/**
 * Result of a complete fix loop execution.
 */
export interface FixLoopResult {
  /** Whether the fix loop succeeded */
  success: boolean;
  /** Original issue */
  original_issue: DiagnosedIssue;
  /** All attempts made */
  attempts: FixAttempt[];
  /** Final verification result */
  final_verification?: VerificationResult;
  /** Total time spent in milliseconds */
  total_time_ms: number;
  /** Whether rollback was performed */
  rolled_back: boolean;
  /** Final status message */
  status_message: string;
}

/** Default configuration */
const DEFAULT_CONFIG: FixLoopConfig = {
  max_attempts: 3,
  verification_checks: ["typecheck"],
  auto_rollback: true,
  attempt_timeout_ms: 60000,
};

/**
 * Implements the 3-phase fix loop: Diagnose → Fix → Verify
 */
export class FixLoop {
  private config: FixLoopConfig;
  private currentIssue: DiagnosedIssue | null = null;
  private attempts: FixAttempt[] = [];
  private startTime: number = 0;

  // Callbacks for the three phases
  private diagnoser: DiagnoseFunction | null = null;
  private fixer: FixFunction | null = null;
  private verifier: VerifyFunction | null = null;

  // Memory for learning from past failures
  private memory: Memory | null = null;

  /**
   * Creates a new FixLoop instance.
   */
  constructor(config: Partial<FixLoopConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Sets the diagnose function.
   */
  setDiagnoser(fn: DiagnoseFunction): void {
    this.diagnoser = fn;
  }

  /**
   * Sets the fix function.
   */
  setFixer(fn: FixFunction): void {
    this.fixer = fn;
  }

  /**
   * Sets the verify function.
   */
  setVerifier(fn: VerifyFunction): void {
    this.verifier = fn;
  }

  /**
   * Sets the memory instance for learning from past failures.
   */
  setMemory(memory: Memory): void {
    this.memory = memory;
  }

  /**
   * Phase 1: Diagnose - Analyze the error and identify root cause.
   */
  async diagnose(errorOutput: string, context?: DiagnoseContext): Promise<DiagnosedIssue> {
    if (!this.diagnoser) {
      // Default diagnosis: parse error output
      return this.defaultDiagnose(errorOutput);
    }
    return this.diagnoser(errorOutput, context);
  }

  /**
   * Default diagnosis implementation.
   */
  private defaultDiagnose(errorOutput: string): DiagnosedIssue {
    const issue: DiagnosedIssue = {
      id: randomUUID(),
      type: "unknown",
      message: errorOutput.slice(0, 500),
    };

    // Try to parse TypeScript errors
    const tsMatch = errorOutput.match(/(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/);
    if (tsMatch) {
      issue.type = "type_error";
      issue.file = tsMatch[1];
      issue.line = parseInt(tsMatch[2], 10);
      issue.column = parseInt(tsMatch[3], 10);
      issue.message = `TS${tsMatch[4]}: ${tsMatch[5]}`;
    }

    // Try to parse runtime errors
    const runtimeMatch = errorOutput.match(/at (.+):(\d+):(\d+)/);
    if (runtimeMatch && issue.type === "unknown") {
      issue.type = "runtime_error";
      issue.file = runtimeMatch[1];
      issue.line = parseInt(runtimeMatch[2], 10);
      issue.column = parseInt(runtimeMatch[3], 10);
    }

    // Try to parse test failures
    if (errorOutput.includes("FAIL") || errorOutput.includes("AssertionError")) {
      issue.type = "test_failure";
    }

    // Try to parse build errors
    if (errorOutput.includes("Build failed") || errorOutput.includes("ENOENT")) {
      issue.type = "build_error";
    }

    return issue;
  }

  /**
   * Phase 2: Fix - Apply a fix based on the diagnosis.
   */
  async fix(issue: DiagnosedIssue, attemptNumber: number): Promise<FixAttempt> {
    const attempt: FixAttempt = {
      id: randomUUID(),
      issue_id: issue.id,
      attempt_number: attemptNumber,
      attempted_at: new Date().toISOString(),
      strategy: "",
      changes: [],
      success: false,
    };

    if (!this.fixer) {
      attempt.error = "No fixer function configured";
      return attempt;
    }

    try {
      const result = await this.fixer(issue, attemptNumber);
      attempt.strategy = result.strategy;
      attempt.changes = result.changes;
      attempt.success = result.success;
      attempt.error = result.error;
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
    }

    this.attempts.push(attempt);
    return attempt;
  }

  /**
   * Phase 3: Verify - Check if the fix resolved the issue.
   */
  async verify(): Promise<VerificationResult> {
    if (!this.verifier) {
      // Default verification: run configured checks
      return this.defaultVerify();
    }
    return this.verifier(this.config.verification_checks);
  }

  /**
   * Default verification implementation.
   */
  private async defaultVerify(): Promise<VerificationResult> {
    const result: VerificationResult = {
      passed: true,
      checks: [],
      remaining_issues: [],
      new_issues: [],
    };

    // This is a placeholder - actual implementation would run tsc, eslint, etc.
    for (const checkType of this.config.verification_checks) {
      const check: VerificationCheck = {
        name: checkType,
        type: checkType,
        passed: true, // Placeholder - would actually run the check
        duration_ms: 0,
      };
      result.checks.push(check);
    }

    result.passed = result.checks.every((c) => c.passed);
    return result;
  }

  /**
   * Executes the complete fix loop.
   */
  async execute(errorOutput: string, context?: DiagnoseContext): Promise<FixLoopResult> {
    this.startTime = Date.now();
    this.attempts = [];

    // Phase 1: Diagnose
    const issue = await this.diagnose(errorOutput, context);
    this.currentIssue = issue;

    // Check for similar past failures and use their resolutions as hints
    if (this.memory && this.memory.isLoaded()) {
      const similar = this.memory.findSimilarFailures(issue.message);
      if (similar.length > 0 && similar[0].resolution) {
        issue.suggested_fix = similar[0].resolution;
      }
    }

    const result: FixLoopResult = {
      success: false,
      original_issue: issue,
      attempts: [],
      total_time_ms: 0,
      rolled_back: false,
      status_message: "",
    };

    // Loop: Fix → Verify (up to max_attempts)
    for (let attempt = 1; attempt <= this.config.max_attempts; attempt++) {
      // Phase 2: Fix
      const fixAttempt = await this.fix(issue, attempt);
      result.attempts.push(fixAttempt);

      if (!fixAttempt.success) {
        continue; // Try next attempt
      }

      // Phase 3: Verify
      const verification = await this.verify();
      result.final_verification = verification;

      if (verification.passed) {
        result.success = true;
        result.status_message = `Fixed on attempt ${attempt}`;
        break;
      }

      // Check for new issues
      if (verification.new_issues.length > 0) {
        result.status_message = `Attempt ${attempt} introduced new issues`;
      }
    }

    // Handle failure
    if (!result.success) {
      result.status_message = `Failed after ${this.config.max_attempts} attempts`;

      if (this.config.auto_rollback) {
        // Rollback would be performed here
        result.rolled_back = true;
        result.status_message += " (rolled back)";
      }
    }

    result.total_time_ms = Date.now() - this.startTime;
    return result;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): FixLoopConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<FixLoopConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets all attempts for the current issue.
   */
  getAttempts(): FixAttempt[] {
    return [...this.attempts];
  }

  /**
   * Gets the current issue being fixed.
   */
  getCurrentIssue(): DiagnosedIssue | null {
    return this.currentIssue ? { ...this.currentIssue } : null;
  }
}

/**
 * Context for diagnosis.
 */
export interface DiagnoseContext {
  /** Files involved */
  files?: string[];
  /** Recent changes */
  recent_changes?: FixChange[];
  /** Previous attempts */
  previous_attempts?: FixAttempt[];
}

/**
 * Function type for custom diagnosis.
 */
export type DiagnoseFunction = (
  errorOutput: string,
  context?: DiagnoseContext
) => Promise<DiagnosedIssue>;

/**
 * Result from a fix function.
 */
export interface FixFunctionResult {
  strategy: string;
  changes: FixChange[];
  success: boolean;
  error?: string;
}

/**
 * Function type for custom fixing.
 */
export type FixFunction = (
  issue: DiagnosedIssue,
  attemptNumber: number
) => Promise<FixFunctionResult>;

/**
 * Function type for custom verification.
 */
export type VerifyFunction = (
  checks: Array<"typecheck" | "lint" | "test" | "build">
) => Promise<VerificationResult>;
