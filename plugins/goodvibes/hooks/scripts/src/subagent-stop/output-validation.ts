import type { HooksState } from '../types/state.js';
import { parseTranscript } from '../shared/index.js';
import { runTypeCheck } from '../automation/build-runner.js';
import { trackFileModification } from '../post-tool-use/file-tracker.js';

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
export async function validateAgentOutput(
  cwd: string,
  transcriptPath: string,
  state: HooksState
): Promise<ValidationResult & { state: HooksState }> {
  const transcriptData = await parseTranscript(transcriptPath);
  const errors: string[] = [];

  // Track all files modified by the agent
  let updatedState = state;
  for (const file of transcriptData.filesModified) {
    updatedState = trackFileModification(updatedState, file);
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
    state: updatedState,
  };
}
