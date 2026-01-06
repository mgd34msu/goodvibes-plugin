/**
 * Quality Gates
 *
 * Pre-commit and pre-push quality checks for TypeScript projects.
 * Runs linting, type checking, formatting, and tests before allowing operations.
 * Supports auto-fix for some checks to maintain code quality standards.
 *
 * @module pre-tool-use/quality-gates
 * @see {@link ../automation/test-runner} for test execution
 * @see {@link ../automation/build-runner} for type checking
 */
/** Configuration for a quality gate check */
export interface QualityGate {
    /** Display name of the gate */
    name: string;
    /** Command to run for the check */
    check: string;
    /** Optional command to auto-fix issues */
    autoFix: string | null;
    /** Whether failure blocks the operation */
    blocking: boolean;
}
/** Result of running a quality gate */
export interface GateResult {
    /** Name of the gate that was run */
    gate: string;
    /** Outcome of the gate check */
    status: 'passed' | 'failed' | 'auto-fixed' | 'skipped';
    /** Optional message with additional details */
    message?: string;
}
/** Default quality gates for TypeScript projects */
export declare const QUALITY_GATES: QualityGate[];
/**
 * Runs all quality gates and returns aggregate results.
 * Iterates through TypeScript, ESLint, Prettier, and Test gates,
 * attempting auto-fixes where available if a gate fails.
 *
 * @param cwd - The current working directory (project root)
 * @param gates - Optional array of gates to run (defaults to QUALITY_GATES)
 * @returns A promise resolving to an object containing:
 *   - allPassed: Whether all gates passed or were auto-fixed
 *   - blocking: Whether any blocking gate failed
 *   - results: Array of individual gate results
 *
 * @example
 * const { allPassed, blocking, results } = await runQualityGates('/project');
 * if (blocking) {
 *   console.error('Blocking quality gates failed');
 * }
 */
export declare function runQualityGates(cwd: string, gates?: QualityGate[]): Promise<{
    allPassed: boolean;
    blocking: boolean;
    results: GateResult[];
}>;
/**
 * Checks if a command string is a git commit command.
 *
 * @param command - The command string to check
 * @returns True if the command contains 'git commit', false otherwise
 *
 * @example
 * isCommitCommand('git commit -m "message"'); // true
 * isCommitCommand('git push origin main');    // false
 */
export declare function isCommitCommand(command: string): boolean;
/**
 * Formats gate results into a human-readable string.
 * Each result is formatted as "GateName: status (message)" and joined with commas.
 *
 * @param results - Array of GateResult objects to format
 * @returns A comma-separated string of formatted gate results
 *
 * @example
 * const formatted = formatGateResults([
 *   { gate: 'TypeScript', status: 'passed' },
 *   { gate: 'ESLint', status: 'failed', message: 'Lint errors' }
 * ]);
 * // Returns: "TypeScript: passed, ESLint: failed (Lint errors)"
 */
export declare function formatGateResults(results: GateResult[]): string;
