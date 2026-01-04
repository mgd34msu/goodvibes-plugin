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
/** Runs all quality gates and returns aggregate results */
export declare function runQualityGates(cwd: string): Promise<{
    allPassed: boolean;
    blocking: boolean;
    results: GateResult[];
}>;
/** Checks if a command is a git commit command */
export declare function isCommitCommand(command: string): boolean;
/** Formats gate results into a human-readable string */
export declare function formatGateResults(results: GateResult[]): string;
