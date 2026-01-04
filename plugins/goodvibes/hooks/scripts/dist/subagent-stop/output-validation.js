import { parseTranscript } from '../shared.js';
import { runTypeCheck } from '../automation/build-runner.js';
import { trackFileModification } from '../post-tool-use/file-tracker.js';
/** Validates agent output by checking type errors in modified files */
export async function validateAgentOutput(cwd, transcriptPath, state) {
    const transcriptData = parseTranscript(transcriptPath);
    const errors = [];
    // Track all files modified by the agent
    for (const file of transcriptData.filesModified) {
        trackFileModification(state, file);
    }
    // Run type check if TypeScript files were modified
    const tsFiles = transcriptData.filesModified.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
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
    };
}
