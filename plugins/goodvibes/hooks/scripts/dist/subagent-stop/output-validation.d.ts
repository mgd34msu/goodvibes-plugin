/**
 * Output Validation
 *
 * Validates agent output by running type checks on modified files.
 * Tracks file modifications and ensures no type errors were introduced
 * by the agent's work before allowing session termination.
 *
 * @module subagent-stop/output-validation
 * @see {@link ../automation/build-runner} for type checking
 * @see {@link ../post-tool-use/file-tracker} for file tracking
 */
import type { HooksState } from '../types/state.js';
/** Result of validating agent output */
export interface ValidationResult {
    /** Whether the output is valid */
    valid: boolean;
    /** List of files modified by the agent */
    filesModified: string[];
    /** List of validation errors */
    errors: string[];
}
/** Validates agent output by checking type errors in modified files */
export declare function validateAgentOutput(cwd: string, transcriptPath: string, state: HooksState): Promise<ValidationResult & {
    state: HooksState;
}>;
