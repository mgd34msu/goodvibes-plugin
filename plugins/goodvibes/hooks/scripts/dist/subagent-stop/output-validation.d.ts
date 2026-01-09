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
/**
 * Validates agent output by checking type errors in modified files.
 * Parses the transcript to track file modifications and runs type checks.
 *
 * @param cwd - The current working directory (project root)
 * @param transcriptPath - Path to the agent's transcript file
 * @param state - Current HooksState to update with file tracking
 * @returns Promise resolving to ValidationResult with updated state
 *
 * @example
 * const result = await validateAgentOutput(cwd, '/path/to/transcript.jsonl', state);
 * if (!result.valid) {
 *   console.log('Validation errors:', result.errors);
 * }
 */
export declare function validateAgentOutput(cwd: string, transcriptPath: string, state: HooksState): Promise<ValidationResult & {
    state: HooksState;
}>;
