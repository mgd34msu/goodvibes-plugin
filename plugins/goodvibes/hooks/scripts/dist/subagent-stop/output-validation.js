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
import { runTypeCheck } from '../automation/build-runner.js';
import { trackFileModification } from '../post-tool-use/file-tracker.js';
import { parseTranscript } from '../shared/index.js';
/** Validates agent output by checking type errors in modified files */
export async function validateAgentOutput(cwd, transcriptPath, state) {
    const transcriptData = await parseTranscript(transcriptPath);
    const errors = [];
    // Track all files modified by the agent
    let updatedState = state;
    for (const file of transcriptData.filesModified) {
        updatedState = trackFileModification(updatedState, file);
    }
    // Run type check if TypeScript files were modified
    const tsFiles = transcriptData.filesModified.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    if (tsFiles.length > 0) {
        const buildResult = await runTypeCheck(cwd);
        if (!buildResult.passed) {
            errors.push(`Type errors after agent work: ${buildResult.errors.length} errors`);
        }
    }
    return {
        valid: errors.length === 0,
        filesModified: transcriptData.filesModified,
        errors,
        state: updatedState,
    };
}
